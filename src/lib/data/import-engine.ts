import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { IMPORT_ENTITY_CONFIG, type ImportEntityType, type FieldClassification } from "@/lib/imports/config";

type SourceRow = Record<string, string | number | boolean | null>;

type MappingEntry = {
  sourceHeader: string;
  targetField: string;
  classification: FieldClassification;
  required?: boolean;
  ignore?: boolean;
  transformRule?: string;
  advancedSettings?: Record<string, unknown>;
};

type RelationshipSetting = {
  key: string;
  relatedEntity?: string;
  relatedField?: string;
  relationshipType?: "one_to_one" | "many_to_one" | "optional" | "required";
  ifNoMatch?: "error" | "skip" | "create_placeholder";
  ifMultipleMatches?: "error" | "pick_first" | "hold_for_review";
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function toEntityType(value: string): ImportEntityType {
  if (value === "contacts") return "contact";
  if (value === "donations") return "donations";
  if (value === "campaigns") return "campaigns";
  if (value === "projects") return "projects";
  if (value === "tasks") return "tasks";
  if (value === "memberships") return "memberships";
  if (value === "organizations") return "organizations";
  if (value === "organizationContact" || value === "organization_contacts") {
    return "organizationContact";
  }
  return value as ImportEntityType;
}

function buildMappedRow(row: SourceRow, mappings: MappingEntry[]) {
  const mapped: Record<string, unknown> = {};
  for (const mapping of mappings) {
    if (mapping.ignore || !mapping.targetField) continue;
    mapped[mapping.targetField] = row[mapping.sourceHeader] ?? null;
  }
  return mapped;
}

function parseDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseBoolean(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return Boolean(value);
}

function parseNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseCommunicationPreferences(value: unknown) {
  const allowed = new Set(["Marketing Email", "Other Mail", "Phone Calls", "Newsletter"]);
  const raw = text(value);
  if (!raw) return [];
  return raw
    .split(/[;,|]/)
    .map((entry) => entry.trim())
    .filter((entry) => allowed.has(entry));
}

function importSchemaErrorMessage(error: unknown) {
  const value = error as { message?: string; details?: string; hint?: string; code?: string };
  const pieces = [value?.message, value?.details, value?.hint].filter(Boolean);
  return pieces.join(" ").toLowerCase();
}

function isMissingImportJobsColumns(error: unknown) {
  const message = importSchemaErrorMessage(error);
  return message.includes("import_mode") || message.includes("dry_run");
}

function isMissingImportStagingSchema(error: unknown) {
  const message = importSchemaErrorMessage(error);
  return (
    message.includes("import_staging_rows") ||
    message.includes("import_duplicate_decisions") ||
    message.includes("import_row_change_log")
  );
}

function isExternalIdSchemaMissing(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return message.includes("contact_external_ids") || message.includes("resolve_contact_by_external_id");
}

function normalizeMappedRow(entityType: ImportEntityType, mappedRow: Record<string, unknown>) {
  const config = IMPORT_ENTITY_CONFIG[entityType];
  const normalized: Record<string, unknown> = {};
  for (const field of config.fields) {
    const current = mappedRow[field.key];
    if (field.type === "date") normalized[field.key] = parseDate(current);
    else if (field.type === "number" || field.type === "currency") normalized[field.key] = parseNumber(current);
    else if (field.type === "boolean") normalized[field.key] = parseBoolean(current);
    else normalized[field.key] = text(current);
  }
  return normalized;
}

function validateMappedRow(entityType: ImportEntityType, normalizedRow: Record<string, unknown>) {
  const config = IMPORT_ENTITY_CONFIG[entityType];
  const errors: string[] = [];

  for (const field of config.fields) {
    const value = normalizedRow[field.key];
    if (field.required && (value === null || value === undefined || text(value) === "")) {
      errors.push(`${field.label} is required.`);
      continue;
    }
    if (!value && value !== 0) continue;
    if (field.type === "email") {
      const email = text(value);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`${field.label} must be a valid email.`);
      }
    }
    if (field.type === "currency" || field.type === "number") {
      if (parseNumber(value) === null) errors.push(`${field.label} must be numeric.`);
    }
    if (field.type === "date") {
      if (!parseDate(value)) errors.push(`${field.label} must be a valid date.`);
    }
  }
  if (entityType === "donations") {
    const amount = parseNumber(normalizedRow.amount);
    if (amount === null || amount < 0) {
      errors.push("Donation amount must be a non-negative number.");
    }
  }

  return errors;
}

function destinationTableForEntity(entityType: ImportEntityType) {
  return IMPORT_ENTITY_CONFIG[entityType].destinationTable;
}

async function resolveRelationship(
  entityType: ImportEntityType,
  relationshipKey: string,
  relationshipValue: unknown,
  sourcePlatform: string,
  organizationId: string
) {
  const config = IMPORT_ENTITY_CONFIG[entityType];
  const rule = config.relationshipRules.find((entry) => entry.key === relationshipKey);
  if (!rule) return { type: "none" as const };
  const value = text(relationshipValue);
  if (!value) {
    if (rule.relationshipType === "required" || rule.relationshipType === "many_to_one") {
      return { type: "error" as const, message: `${relationshipKey} is required.` };
    }
    return { type: "none" as const };
  }

  const supabase = await createClient();
  const relatedEntity = toEntityType(rule.relatedEntity as string);
  const relatedTable = destinationTableForEntity(relatedEntity);
  if (rule.relatedField === "external_source_id" && relatedEntity === "contact") {
    const rpc = await supabase.rpc("resolve_contact_by_external_id", {
      org_id: organizationId,
      source: sourcePlatform,
      external: value
    });
    if (!rpc.error && rpc.data) {
      return { type: "resolved" as const, id: String(rpc.data) };
    }
    if (rpc.error && !isExternalIdSchemaMissing(rpc.error)) {
      return {
        type: "error" as const,
        message: `Relationship lookup failed for ${relationshipKey}.`
      };
    }
  }
  let query = supabase.from(relatedTable).select("id").eq("organization_id", organizationId);
  if (rule.relatedField === "external_source_id") {
    query = query.eq("source_platform", sourcePlatform).eq("external_source_id", value);
  } else {
    query = query.eq(rule.relatedField, value);
  }

  const { data, error } = await query.limit(2);
  if (error) {
    return { type: "error" as const, message: `Relationship lookup failed for ${relationshipKey}.` };
  }

  if (!data || data.length === 0) {
    if (rule.ifNoMatch === "create_placeholder") {
      return { type: "placeholder" as const, rule, value };
    }
    if (rule.ifNoMatch === "skip") {
      return { type: "skip" as const, message: `Missing relationship for ${relationshipKey}.` };
    }
    return { type: "error" as const, message: `No match found for ${relationshipKey}.` };
  }

  if (data.length > 1 && rule.ifMultipleMatches !== "pick_first") {
    return {
      type: "ambiguous" as const,
      message: `Multiple matches found for ${relationshipKey}.`
    };
  }

  return { type: "resolved" as const, id: data[0].id as string };
}

async function findExistingByMatch(params: {
  entityType: ImportEntityType;
  organizationId: string;
  sourcePlatform: string;
  normalizedRow: Record<string, unknown>;
  matchBy: string[];
}) {
  const table = destinationTableForEntity(params.entityType);
  const supabase = await createClient();
  for (const field of params.matchBy) {
    const value = params.normalizedRow[field];
    if (!text(value)) continue;
    if (params.entityType === "contact" && field === "external_source_id") {
      const externalId = text(value).toLowerCase();
      const sourceSystem = text(params.sourcePlatform).toLowerCase();
      try {
        const { data: externalMatch, error: externalError } = await supabase
          .from("contact_external_ids")
          .select("contact_id")
          .eq("organization_id", params.organizationId)
          .eq("source_system", sourceSystem)
          .eq("external_id", externalId)
          .eq("is_active", true)
          .limit(2);
        if (externalError && !isExternalIdSchemaMissing(externalError)) {
          throw externalError;
        }
        if (externalMatch && externalMatch.length > 0) {
          return externalMatch.map((row) => ({
            id: row.contact_id as string,
            matchField: field
          }));
        }
      } catch {
        // Fall back to legacy matching below.
      }
    }
    let query = supabase.from(table).select("id").eq("organization_id", params.organizationId);
    if (field === "external_source_id") {
      query = query.eq("source_platform", params.sourcePlatform).eq("external_source_id", text(value));
    } else if (field === "external_transaction_id") {
      query = query
        .eq("source_platform", params.sourcePlatform)
        .eq("external_transaction_id", text(value));
    } else {
      query = query.eq(field, value as string);
    }
    const { data, error } = await query.limit(2);
    if (error) continue;
    if (data && data.length > 0) {
      return data.map((row) => ({ id: row.id as string, matchField: field }));
    }
  }
  return [];
}

async function upsertContactExternalId(input: {
  organizationId: string;
  contactId: string;
  sourceSystem: string;
  externalId: string;
  userId: string;
}) {
  const supabase = await createClient();
  const sourceSystem = text(input.sourceSystem).toLowerCase();
  const externalId = text(input.externalId).toLowerCase();
  if (!sourceSystem || !externalId) return;

  const { error } = await supabase.from("contact_external_ids").upsert(
    {
      organization_id: input.organizationId,
      contact_id: input.contactId,
      source_system: sourceSystem,
      external_id: externalId,
      external_type: "import",
      is_primary: true,
      is_active: true,
      updated_by: input.userId,
      created_by: input.userId
    },
    { onConflict: "organization_id,source_system,external_id" }
  );
  if (error && !isExternalIdSchemaMissing(error)) {
    throw error;
  }
}

export async function stageImportBatch(input: {
  entityType: ImportEntityType;
  sourceSystem: string;
  fileName: string;
  fileType: "csv" | "xlsx" | "xls";
  headers: string[];
  rows: SourceRow[];
  mappings: MappingEntry[];
  relationshipSettings?: RelationshipSetting[];
  importMode: "insert" | "update" | "upsert" | "dry_run";
  matchBy?: string[];
}) {
  const context = await requireStaffPermission("can_manage_imports");
  const supabase = await createClient();

  const jobPayload = {
    organization_id: context.organizationId,
    source_platform: input.sourceSystem,
    source_type: input.fileType,
    target_domain: input.entityType,
    original_file_name: input.fileName,
    status: "mapped",
    import_mode: input.importMode,
    dry_run: input.importMode === "dry_run",
    source_metadata: {
      headers: input.headers,
      relationship_settings: input.relationshipSettings ?? [],
      match_by: input.matchBy ?? IMPORT_ENTITY_CONFIG[input.entityType].defaultMatchBy
    },
    duplicate_strategy: "none",
    total_rows: input.rows.length,
    created_by: context.userId
  };

  let { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .insert(jobPayload)
    .select("id")
    .single();

  if (jobError && isMissingImportJobsColumns(jobError)) {
    const {
      import_mode: _importMode,
      dry_run: _dryRun,
      ...legacyJobPayload
    } = jobPayload as typeof jobPayload & { import_mode?: string; dry_run?: boolean };
    void _importMode;
    void _dryRun;

    const retry = await supabase
      .from("import_jobs")
      .insert(legacyJobPayload)
      .select("id")
      .single();
    job = retry.data;
    jobError = retry.error;
  }
  if (jobError) throw jobError;
  if (!job?.id) {
    throw new Error("Unable to create import batch job.");
  }

  const mappingRows = input.mappings
    .filter((mapping) => !mapping.ignore && mapping.targetField)
    .map((mapping) => ({
      organization_id: context.organizationId,
      import_job_id: job.id,
      source_field: mapping.sourceHeader,
      target_field: mapping.targetField,
      transform_rule: mapping.transformRule ?? null
    }));
  if (mappingRows.length > 0) {
    const { error: mappingError } = await supabase.from("import_mappings").insert(mappingRows);
    if (mappingError) throw mappingError;
  }

  const stagingRows = input.rows.map((row, index) => {
    const mappedRow = buildMappedRow(row, input.mappings);
    const normalizedRow = normalizeMappedRow(input.entityType, mappedRow);
    return {
      organization_id: context.organizationId,
      import_job_id: job.id,
      row_index: index + 1,
      source_row: row,
      mapped_row: mappedRow,
      normalized_row: normalizedRow,
      created_by: context.userId
    };
  });
  if (stagingRows.length > 0) {
    const { error: stagingError } = await supabase.from("import_staging_rows").insert(stagingRows);
    if (stagingError) {
      if (isMissingImportStagingSchema(stagingError)) {
        const supportsLegacyFallback = input.entityType === "contact" || input.entityType === "donations";
        if (supportsLegacyFallback) {
          return {
            jobId: job.id,
            totalRows: input.rows.length,
            legacyFallback: true,
            legacyReason:
              "Import staging tables are missing. Falling back to legacy import commit for contacts/donations."
          };
        }
        throw new Error(
          "Import engine tables are missing in this environment. Please run the latest Supabase migrations (202603130017 and newer), then retry."
        );
      }
      throw stagingError;
    }
  }

  return { jobId: job.id, totalRows: input.rows.length, legacyFallback: false };
}

export async function validateImportBatch(input: {
  jobId: string;
  matchBy?: string[];
}) {
  const context = await requireStaffPermission("can_manage_imports");
  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .select("id, target_domain, source_platform, source_metadata")
    .eq("organization_id", context.organizationId)
    .eq("id", input.jobId)
    .single();
  if (jobError) throw jobError;

  const entityType = toEntityType(text(job.target_domain));
  const config = IMPORT_ENTITY_CONFIG[entityType];
  void config;
  void input.matchBy;

  const { data: rows, error: rowsError } = await supabase
    .from("import_staging_rows")
    .select("id, row_index, mapped_row, normalized_row, duplicate_decision")
    .eq("organization_id", context.organizationId)
    .eq("import_job_id", job.id)
    .order("row_index", { ascending: true });
  if (rowsError) throw rowsError;

  const summary = {
    valid: 0,
    errors: 0,
    unresolvedRelationships: 0
  };

  for (const row of rows ?? []) {
    const normalizedRow = (row.normalized_row as Record<string, unknown>) ?? {};
    const mappedRow = (row.mapped_row as Record<string, unknown>) ?? {};
    const validationErrors = validateMappedRow(entityType, normalizedRow);
    const relationshipResolution: Record<string, unknown> = {};
    const unresolved: string[] = [];

    for (const rule of config.relationshipRules) {
      const resolveResult = await resolveRelationship(
        entityType,
        rule.key,
        mappedRow[rule.key],
        text(job.source_platform),
        context.organizationId
      );
      if (resolveResult.type === "resolved") {
        relationshipResolution[`${rule.key}_id`] = resolveResult.id;
      } else if (resolveResult.type === "placeholder") {
        relationshipResolution[`${rule.key}_placeholder`] = resolveResult.value;
      } else if (resolveResult.type === "skip") {
        unresolved.push(resolveResult.message);
      } else if (resolveResult.type === "ambiguous" || resolveResult.type === "error") {
        unresolved.push(resolveResult.message);
      }
    }

    let rowStatus = "valid";
    if (validationErrors.length > 0) rowStatus = "error";
    else if (unresolved.length > 0) rowStatus = "unresolved_relationship";

    if (rowStatus === "valid") summary.valid += 1;
    if (rowStatus === "error") summary.errors += 1;
    if (rowStatus === "unresolved_relationship") summary.unresolvedRelationships += 1;

    const { error: rowUpdateError } = await supabase
      .from("import_staging_rows")
      .update({
        validation_errors: validationErrors,
        relationship_resolution: relationshipResolution,
        duplicate_candidates: [],
        duplicate_decision: "pending",
        row_status: rowStatus
      })
      .eq("organization_id", context.organizationId)
      .eq("id", row.id);
    if (rowUpdateError) throw rowUpdateError;
  }

  await supabase
    .from("import_jobs")
    .update({
      status: "validated",
      processed_rows: summary.valid + summary.errors + summary.unresolvedRelationships,
      successful_rows: summary.valid,
      failed_rows: summary.errors + summary.unresolvedRelationships,
      error_summary:
        summary.errors > 0 || summary.unresolvedRelationships > 0
          ? `${summary.errors} validation errors, ${summary.unresolvedRelationships} unresolved relationships`
          : null
    })
    .eq("organization_id", context.organizationId)
    .eq("id", job.id);

  const { data: updatedRows } = await supabase
    .from("import_staging_rows")
    .select(
      "id, row_index, row_status, validation_errors, relationship_resolution"
    )
    .eq("organization_id", context.organizationId)
    .eq("import_job_id", job.id)
    .order("row_index", { ascending: true })
    .limit(500);

  return {
    jobId: job.id,
    summary,
    rows: updatedRows ?? []
  };
}

export async function setDuplicateDecision(input: {
  jobId: string;
  stagingRowId: string;
  decision: "create_new" | "update_existing" | "merge" | "skip" | "hold";
  targetEntityId?: string;
  reason?: string;
  mergePayload?: Record<string, unknown>;
}) {
  const context = await requireStaffPermission("can_manage_imports");
  const supabase = await createClient();

  const { error: stageError } = await supabase
    .from("import_staging_rows")
    .update({
      duplicate_decision: input.decision,
      row_status: input.decision === "hold" ? "held" : input.decision === "skip" ? "skipped" : "duplicate"
    })
    .eq("organization_id", context.organizationId)
    .eq("import_job_id", input.jobId)
    .eq("id", input.stagingRowId);
  if (stageError) throw stageError;

  const { error: decisionError } = await supabase
    .from("import_duplicate_decisions")
    .insert({
      organization_id: context.organizationId,
      import_job_id: input.jobId,
      staging_row_id: input.stagingRowId,
      decision: input.decision,
      target_entity_id: input.targetEntityId ?? null,
      decision_reason: input.reason ?? null,
      merge_payload: input.mergePayload ?? {},
      created_by: context.userId
    });
  if (decisionError) throw decisionError;
}

async function ensureCampaignForDonation(params: {
  organizationId: string;
  sourcePlatform: string;
  campaignName?: string;
  campaignExternalId?: string;
  userId: string;
}) {
  const supabase = await createClient();
  if (params.campaignExternalId) {
    const { data } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("organization_id", params.organizationId)
      .eq("source_platform", params.sourcePlatform)
      .eq("external_source_id", params.campaignExternalId)
      .maybeSingle();
    if (data?.id) return { id: data.id as string, name: text(data.name) };
  }

  const campaignName = params.campaignName || "Imported Donations";
  const { data: existing } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("organization_id", params.organizationId)
    .eq("name", campaignName)
    .maybeSingle();
  if (existing?.id) {
    return { id: existing.id as string, name: text(existing.name) };
  }

  const { data: created, error } = await supabase
    .from("campaigns")
    .insert({
      organization_id: params.organizationId,
      name: campaignName,
      status: "Active",
      description: "Auto-created by import engine",
      source_platform: params.sourcePlatform,
      external_source_id: params.campaignExternalId || null,
      created_by: params.userId
    })
    .select("id, name")
    .single();
  if (error) throw error;
  return { id: created.id as string, name: text(created.name) };
}

async function prepareEntityPayload(input: {
  entityType: ImportEntityType;
  normalizedRow: Record<string, unknown>;
  relationshipResolution: Record<string, unknown>;
  organizationId: string;
  sourcePlatform: string;
  userId: string;
  importJobId: string;
}) {
  const normalized = input.normalizedRow;
  if (input.entityType === "contact") {
    const organizationName = text(normalized.organization_name) || null;
    const entityType = organizationName ? "organization" : "person";
    const externalSourceId = text(normalized.external_source_id) || null;
    const sourcePlatform = text(input.sourcePlatform).toLowerCase();
    const webconnexId =
      sourcePlatform === "webconnex" || sourcePlatform === "givingfuel"
        ? externalSourceId
        : null;
    const requestedTrackingStatus = text(normalized.tracking_status).toLowerCase();
    const trackingStatus =
      webconnexId
        ? "donor"
        : requestedTrackingStatus === "donor" ||
            requestedTrackingStatus === "lead" ||
            requestedTrackingStatus === "non_lead"
          ? requestedTrackingStatus
          : "lead";
    return {
      table: "contacts",
      payload: {
        organization_id: input.organizationId,
        first_name: text(normalized.first_name) || "Unknown",
        last_name: text(normalized.last_name) || "Unknown",
        preferred_name: text(normalized.preferred_name) || null,
        email: text(normalized.email) || null,
        alternate_email: text(normalized.alternate_email) || null,
        phone: text(normalized.phone) || null,
        mobile_number: text(normalized.mobile_number) || null,
        alternate_phone: text(normalized.alternate_phone) || null,
        emergency_contact: text(normalized.emergency_contact) || null,
        emergency_contact_phone: text(normalized.emergency_contact_phone) || null,
        address_line_1: text(normalized.address_line_1) || null,
        address_line_2: text(normalized.address_line_2) || null,
        city: text(normalized.city) || null,
        state: text(normalized.state) || null,
        postal_code: text(normalized.postal_code) || null,
        mailing_address_line_1: text(normalized.mailing_address_line_1) || null,
        mailing_address_line_2: text(normalized.mailing_address_line_2) || null,
        mailing_city: text(normalized.mailing_city) || null,
        mailing_state: text(normalized.mailing_state) || null,
        mailing_postal_code: text(normalized.mailing_postal_code) || null,
        formal_letter_name: text(normalized.formal_letter_name) || null,
        communication_preferences: parseCommunicationPreferences(
          normalized.communication_preferences
        ),
        donor_status:
          text(normalized.donor_status) ||
          (trackingStatus === "donor" ? "active" : trackingStatus === "non_lead" ? "inactive" : "prospect"),
        member_status: text(normalized.member_status) || "none",
        organization_name: organizationName,
        entity_type: entityType,
        tracking_status: trackingStatus,
        webconnex_id: webconnexId,
        external_source: input.sourcePlatform,
        external_source_id: externalSourceId,
        import_job_id: input.importJobId,
        created_by: input.userId,
        updated_by: input.userId
      }
    };
  }

  if (input.entityType === "donations") {
    const contactId = text(input.relationshipResolution.contact_external_source_id_id || "");
    const campaign = await ensureCampaignForDonation({
      organizationId: input.organizationId,
      sourcePlatform: input.sourcePlatform,
      campaignExternalId: text(normalized.campaign_external_source_id) || undefined,
      campaignName: text(normalized.campaign_name) || undefined,
      userId: input.userId
    });
    return {
      table: "donations",
      payload: {
        organization_id: input.organizationId,
        contact_id: contactId || null,
        campaign_id: campaign.id,
        amount: parseNumber(normalized.amount) ?? 0,
        currency: text(normalized.currency) || "USD",
        donation_date: parseDate(normalized.donation_date) || new Date().toISOString().slice(0, 10),
        payment_type: text(normalized.payment_type) || "Cash",
        check_number: text(normalized.check_number) || null,
        transaction_id: text(normalized.transaction_id) || null,
        memo: text(normalized.memo) || null,
        source: "import",
        source_platform: input.sourcePlatform,
        external_transaction_id: text(normalized.external_transaction_id) || null,
        is_recurring: Boolean(normalized.is_recurring),
        import_job_id: input.importJobId,
        imported_at: new Date().toISOString(),
        campaign: campaign.name
      }
    };
  }

  if (input.entityType === "organizations") {
    return {
      table: "crm_organizations",
      payload: {
        organization_id: input.organizationId,
        name: text(normalized.name) || "Imported Organization",
        description: text(normalized.description) || null,
        source_platform: input.sourcePlatform,
        external_source_id: text(normalized.external_source_id) || null
      }
    };
  }

  if (input.entityType === "campaigns") {
    return {
      table: "campaigns",
      payload: {
        organization_id: input.organizationId,
        name: text(normalized.name) || "Imported Campaign",
        description: text(normalized.description) || null,
        status: text(normalized.status) || "Active",
        start_date: parseDate(normalized.start_date) || null,
        end_date: parseDate(normalized.end_date) || null,
        source_platform: input.sourcePlatform,
        external_source_id: text(normalized.external_source_id) || null,
        created_by: input.userId
      }
    };
  }

  if (input.entityType === "projects") {
    return {
      table: "projects",
      payload: {
        organization_id: input.organizationId,
        name: text(normalized.name) || "Imported Project",
        description: text(normalized.description) || null,
        status: text(normalized.status) || "active",
        project_start_date: parseDate(normalized.project_start_date) || null,
        expected_end_date: parseDate(normalized.expected_end_date) || null,
        source_platform: input.sourcePlatform,
        external_source_id: text(normalized.external_source_id) || null,
        created_by: input.userId
      }
    };
  }

  if (input.entityType === "tasks") {
    const projectId = text(input.relationshipResolution.project_external_source_id_id || "");
    return {
      table: "tasks",
      payload: {
        organization_id: input.organizationId,
        title: text(normalized.title) || "Imported Task",
        description: text(normalized.description) || null,
        status: text(normalized.status) || "todo",
        priority: text(normalized.priority) || "medium",
        due_date: parseDate(normalized.due_date) || null,
        project_id: projectId || null,
        source_platform: input.sourcePlatform,
        external_source_id: text(normalized.external_source_id) || null,
        created_by: input.userId
      }
    };
  }

  if (input.entityType === "memberships") {
    const contactId = text(input.relationshipResolution.contact_external_source_id_id || "");
    const supabase = await createClient();
    const membershipTypeName = text(normalized.membership_type) || "Imported Membership";
    const { data: existingType } = await supabase
      .from("membership_types")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("name", membershipTypeName)
      .maybeSingle();
    let membershipTypeId = existingType?.id as string | undefined;
    if (!membershipTypeId) {
      const { data: createdType, error } = await supabase
        .from("membership_types")
        .insert({
          organization_id: input.organizationId,
          key: membershipTypeName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name: membershipTypeName,
          status: "active"
        })
        .select("id")
        .single();
      if (error) throw error;
      membershipTypeId = createdType.id as string;
    }
    return {
      table: "memberships",
      payload: {
        organization_id: input.organizationId,
        contact_id: contactId || null,
        membership_type_id: membershipTypeId,
        status: text(normalized.status) || "active",
        start_date: parseDate(normalized.start_date) || new Date().toISOString().slice(0, 10),
        end_date: parseDate(normalized.end_date) || null,
        renewal_date: parseDate(normalized.renewal_date) || null,
        source_platform: input.sourcePlatform,
        external_source_id: text(normalized.external_source_id) || null,
        created_by: input.userId,
        updated_by: input.userId
      }
    };
  }

  const contactId = text(input.relationshipResolution.contact_external_source_id_id || "");
  const organizationId = text(input.relationshipResolution.organization_external_source_id_id || "");
  return {
    table: "contact_organization_links",
    payload: {
      organization_id: input.organizationId,
      contact_id: contactId || null,
      crm_organization_id: organizationId || null,
      relationship_type: text(normalized.relationship_type) || "member"
    }
  };
}

export async function commitImportBatch(input: {
  jobId: string;
  mode: "insert" | "update" | "upsert" | "dry_run";
  matchBy?: string[];
}) {
  const context = await requireStaffPermission("can_manage_imports");
  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .select("id, target_domain, source_platform, dry_run")
    .eq("organization_id", context.organizationId)
    .eq("id", input.jobId)
    .single();
  if (jobError) throw jobError;

  const entityType = toEntityType(text(job.target_domain));
  const config = IMPORT_ENTITY_CONFIG[entityType];
  const matchBy = input.matchBy && input.matchBy.length > 0 ? input.matchBy : config.defaultMatchBy;

  const { data: rows, error: rowsError } = await supabase
    .from("import_staging_rows")
    .select(
      "id, row_index, row_status, normalized_row, relationship_resolution"
    )
    .eq("organization_id", context.organizationId)
    .eq("import_job_id", job.id)
    .order("row_index", { ascending: true });
  if (rowsError) throw rowsError;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    if (text(row.row_status) !== "valid") {
      skipped += 1;
      continue;
    }

    try {
      const normalizedRow = (row.normalized_row as Record<string, unknown>) ?? {};
      const relationshipResolution = (row.relationship_resolution as Record<string, unknown>) ?? {};
      const prepared = await prepareEntityPayload({
        entityType,
        normalizedRow,
        relationshipResolution,
        organizationId: context.organizationId,
        sourcePlatform: text(job.source_platform),
        userId: context.userId,
        importJobId: job.id
      });

      const existingCandidates = await findExistingByMatch({
        entityType,
        organizationId: context.organizationId,
        sourcePlatform: text(job.source_platform),
        normalizedRow,
        matchBy
      });
      const existingId = existingCandidates[0]?.id;

      if (input.mode === "insert" && existingId) {
        await supabase
          .from("import_staging_rows")
          .update({ row_status: "skipped" })
          .eq("organization_id", context.organizationId)
          .eq("id", row.id);
        skipped += 1;
        continue;
      }

      if (input.mode === "update" && !existingId) {
        await supabase
          .from("import_staging_rows")
          .update({
            row_status: "error",
            validation_errors: [{ message: "No existing record found for update mode." }]
          })
          .eq("organization_id", context.organizationId)
          .eq("id", row.id);
        failed += 1;
        continue;
      }

      if (input.mode === "dry_run" || Boolean(job.dry_run)) {
        await supabase
          .from("import_staging_rows")
          .update({ row_status: "valid" })
          .eq("organization_id", context.organizationId)
          .eq("id", row.id);
        continue;
      }

      if (existingId) {
        const { data: before } = await supabase
          .from(prepared.table)
          .select("*")
          .eq("organization_id", context.organizationId)
          .eq("id", existingId)
          .single();
        const { data: after, error: updateError } = await supabase
          .from(prepared.table)
          .update(prepared.payload)
          .eq("organization_id", context.organizationId)
          .eq("id", existingId)
          .select("*")
          .single();
        if (updateError) throw updateError;

        await supabase.from("import_row_change_log").insert({
          organization_id: context.organizationId,
          import_job_id: job.id,
          staging_row_id: row.id,
          action_type: "updated",
          target_table: prepared.table,
          target_row_id: existingId,
          before_data: before ?? {},
          after_data: after ?? {},
          created_by: context.userId
        });

        await supabase
          .from("import_staging_rows")
          .update({
            row_status: "committed",
            committed_entity_type: entityType,
            committed_entity_id: existingId
          })
          .eq("organization_id", context.organizationId)
          .eq("id", row.id);

        if (entityType === "contact") {
          const preparedPayload = prepared.payload as Record<string, unknown>;
          const externalSourceId = text(preparedPayload.external_source_id);
          if (externalSourceId) {
            await upsertContactExternalId({
              organizationId: context.organizationId,
              contactId: existingId,
              sourceSystem: text(job.source_platform),
              externalId: externalSourceId,
              userId: context.userId
            });
          }
        }
        updated += 1;
      } else {
        const { data: after, error: insertError } = await supabase
          .from(prepared.table)
          .insert(prepared.payload)
          .select("*")
          .single();
        if (insertError) throw insertError;

        await supabase.from("import_row_change_log").insert({
          organization_id: context.organizationId,
          import_job_id: job.id,
          staging_row_id: row.id,
          action_type: "inserted",
          target_table: prepared.table,
          target_row_id: after?.id ?? null,
          before_data: {},
          after_data: after ?? {},
          created_by: context.userId
        });

        await supabase
          .from("import_staging_rows")
          .update({
            row_status: "committed",
            committed_entity_type: entityType,
            committed_entity_id: (after?.id as string) ?? null
          })
          .eq("organization_id", context.organizationId)
          .eq("id", row.id);

        if (entityType === "contact") {
          const preparedPayload = prepared.payload as Record<string, unknown>;
          const externalSourceId = text(preparedPayload.external_source_id);
          const insertedContactId = text(after?.id);
          if (externalSourceId && insertedContactId) {
            await upsertContactExternalId({
              organizationId: context.organizationId,
              contactId: insertedContactId,
              sourceSystem: text(job.source_platform),
              externalId: externalSourceId,
              userId: context.userId
            });
          }
        }
        inserted += 1;
      }
    } catch (error) {
      failed += 1;
      await supabase
        .from("import_staging_rows")
        .update({
          row_status: "error",
          validation_errors: [
            {
              message:
                error instanceof Error ? error.message : "Commit failed during import processing."
            }
          ]
        })
        .eq("organization_id", context.organizationId)
        .eq("id", row.id);
    }
  }

  const processed = inserted + updated + skipped + failed;
  await supabase
    .from("import_jobs")
    .update({
      status: failed > 0 ? "failed" : "completed",
      processed_rows: processed,
      successful_rows: inserted + updated,
      failed_rows: failed,
      completed_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("id", job.id);

  await supabase.from("audit_log").insert({
    organization_id: context.organizationId,
    actor_user_id: context.userId,
    action_type: "import_job_committed",
    target_entity_type: "import_jobs",
    target_entity_id: job.id,
    metadata: {
      mode: input.mode,
      inserted,
      updated,
      skipped,
      failed
    }
  });

  return {
    jobId: job.id,
    inserted,
    updated,
    skipped,
    failed
  };
}

export async function getImportBatchResults(jobId: string) {
  const context = await requireStaffPermission("can_manage_imports");
  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", jobId)
    .single();
  if (jobError) throw jobError;

  const { data: rows, error: rowsError } = await supabase
    .from("import_staging_rows")
    .select(
      "id, row_index, row_status, validation_errors, duplicate_candidates, duplicate_decision, committed_entity_type, committed_entity_id"
    )
    .eq("organization_id", context.organizationId)
    .eq("import_job_id", jobId)
    .order("row_index", { ascending: true });
  if (rowsError) throw rowsError;

  const summary = (rows ?? []).reduce(
    (acc, row) => {
      const key = text(row.row_status) || "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    job,
    summary,
    rows: rows ?? []
  };
}

export async function rollbackImportBatch(jobId: string) {
  const context = await requireStaffPermission("can_manage_imports");
  const supabase = await createClient();
  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .select("id, status")
    .eq("organization_id", context.organizationId)
    .eq("id", jobId)
    .single();
  if (jobError) throw jobError;

  const { data: changeRows, error: changeRowsError } = await supabase
    .from("import_row_change_log")
    .select("id, action_type, target_table, target_row_id, before_data, rollback_status")
    .eq("organization_id", context.organizationId)
    .eq("import_job_id", job.id)
    .eq("rollback_status", "not_rolled_back")
    .order("created_at", { ascending: false });
  if (changeRowsError) throw changeRowsError;

  let rolledBack = 0;
  for (const changeRow of changeRows ?? []) {
    try {
      if (text(changeRow.action_type) === "inserted" && changeRow.target_row_id) {
        await supabase
          .from(text(changeRow.target_table))
          .delete()
          .eq("organization_id", context.organizationId)
          .eq("id", changeRow.target_row_id);
      } else if (text(changeRow.action_type) === "updated" && changeRow.target_row_id) {
        await supabase
          .from(text(changeRow.target_table))
          .update((changeRow.before_data as Record<string, unknown>) ?? {})
          .eq("organization_id", context.organizationId)
          .eq("id", changeRow.target_row_id);
      }

      await supabase
        .from("import_row_change_log")
        .update({
          rollback_status: "rolled_back",
          rolled_back_at: new Date().toISOString()
        })
        .eq("organization_id", context.organizationId)
        .eq("id", changeRow.id);
      rolledBack += 1;
    } catch {
      await supabase
        .from("import_row_change_log")
        .update({
          rollback_status: "rollback_failed",
          rolled_back_at: new Date().toISOString()
        })
        .eq("organization_id", context.organizationId)
        .eq("id", changeRow.id);
    }
  }

  await supabase
    .from("import_staging_rows")
    .update({ row_status: "rolled_back" })
    .eq("organization_id", context.organizationId)
    .eq("import_job_id", job.id)
    .eq("row_status", "committed");

  await supabase
    .from("import_jobs")
    .update({
      rolled_back_at: new Date().toISOString(),
      rolled_back_by: context.userId,
      rollback_metadata: { rolled_back_rows: rolledBack }
    })
    .eq("organization_id", context.organizationId)
    .eq("id", job.id);

  await supabase.from("audit_log").insert({
    organization_id: context.organizationId,
    actor_user_id: context.userId,
    action_type: "import_job_rolled_back",
    target_entity_type: "import_jobs",
    target_entity_id: job.id,
    metadata: { rolled_back_rows: rolledBack }
  });

  return { jobId: job.id, rolledBackRows: rolledBack };
}
