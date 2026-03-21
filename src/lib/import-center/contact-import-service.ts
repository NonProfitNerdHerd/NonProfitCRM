import {
  resolveImportCenterExecution,
  resolveImportCenterSupabaseClient
} from "@/lib/import-center/execution-context";
import {
  mapRowToTargets,
  mappingSummary,
  sanitizeInternalKey
} from "@/lib/import-center/field-mapping-engine";
import { appendImportCenterRowError, logImportCenterAudit } from "@/lib/import-center/logging-service";
import { createContactCustomField, listContactCustomFields } from "@/lib/import-center/custom-fields-service";
import {
  resolveMappingTransform,
  tokenizeMappedValue,
  type ResolvedImportCenterMappingTransform
} from "@/lib/import-center/mapping-transform";
import {
  buildRerunMatchingWarnings,
  detectInFileDuplicateWarnings,
  isBlankImportValue,
  validateContactImportPayload,
  validateRerunMatchingConfig
} from "@/lib/import-center/validation-engine";
import {
  CONTACT_STANDARD_FIELDS,
  TRANSACTION_CONTACT_CREATE_FIELDS,
  TRANSACTION_CONTACT_MATCH_FIELDS,
  TRANSACTION_STANDARD_FIELDS,
  type ContactClassificationInput,
  type ContactImportRunInput,
  type ImportCenterType,
  type ImportCenterMapping,
  type ReimportMatchSettings
} from "@/lib/import-center/types";
import { listImportCenterTemplates } from "@/lib/import-center/template-service";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function importCenterSchemaErrorMessage(error: unknown) {
  const value = error as { message?: string; details?: string; hint?: string; code?: string };
  return [value?.message, value?.details, value?.hint, value?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isImportCenterSchemaMissingError(error: unknown) {
  const message = importCenterSchemaErrorMessage(error);
  return (
    message.includes("import_center_templates") ||
    message.includes("import_center_jobs") ||
    message.includes("import_center_job_errors") ||
    message.includes("contact_custom_fields") ||
    message.includes("contact_custom_field_values") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function normalizePhone(value: unknown) {
  return toText(value).replace(/\D+/g, "");
}

function donorStatusForCategory(category: ContactClassificationInput["contactCategory"]) {
  if (category === "donor") return "active";
  if (category === "non_lead") return "inactive";
  return "prospect";
}

function resolveContactIdentityFields(input: {
  classification: ContactClassificationInput;
  standard: Record<string, unknown>;
}) {
  const contactType = input.classification.contactType;
  const mappedOrganizationName = toText(input.standard.organization_name);

  if (contactType === "organization") {
    if (!mappedOrganizationName) {
      return {
        ok: false as const,
        errorMessage: "Organization Name is required when Contact Type is Organization."
      };
    }
    return {
      ok: true as const,
      firstName: mappedOrganizationName,
      lastName: "(Organization)",
      organizationName: mappedOrganizationName
    };
  }

  const firstName = toText(input.standard.first_name);
  const lastName = toText(input.standard.last_name);
  if (!firstName || !lastName) {
    return {
      ok: false as const,
      errorMessage: "First Name and Last Name are required when Contact Type is Person."
    };
  }
  return {
    ok: true as const,
    firstName,
    lastName,
    organizationName: mappedOrganizationName || null
  };
}

function normalizeMatchValue(destinationField: string, value: unknown) {
  const raw = toText(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (
    destinationField === "email" ||
    destinationField === "alternate_email" ||
    destinationField === "external_source_id"
  ) {
    return lower;
  }
  if (
    destinationField === "phone" ||
    destinationField === "mobile_number" ||
    destinationField === "alternate_phone"
  ) {
    return normalizePhone(raw);
  }
  return raw;
}

function normalizeRerunMatchSettings(input?: Partial<ReimportMatchSettings> | null): ReimportMatchSettings {
  return {
    enabled: Boolean(input?.enabled),
    sourceMatchColumn: toText(input?.sourceMatchColumn) || null,
    destinationMatchField: toText(input?.destinationMatchField) || null,
    onMatchBehavior: input?.onMatchBehavior ?? "update_blank_only",
    onNoMatchBehavior: input?.onNoMatchBehavior ?? "create_new",
    ignoreBlankOverwrites: true,
    missingKeyBehavior: input?.missingKeyBehavior ?? "skip_row"
  };
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  if (size <= 0) return [items];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function validDestinationMatchFields(customFields: Array<Record<string, unknown>>) {
  const standard = CONTACT_STANDARD_FIELDS.filter((field) => field.key !== "tags").map(
    (field) => field.key
  );
  const custom = customFields
    .map((field) => toText(field.internal_key))
    .filter(Boolean)
    .map((internalKey) => `custom:${internalKey}`);
  return [...standard, ...custom];
}

async function findContactMatchesByField(input: {
  organizationId: string;
  destinationField: string;
  keyValue: string;
  customFieldIdCache?: Map<string, string | null>;
}) {
  const supabase = await resolveImportCenterSupabaseClient();
  const destinationField = toText(input.destinationField);
  const keyValue = normalizeMatchValue(destinationField, input.keyValue);
  if (!destinationField || !keyValue) return [];

  if (destinationField.startsWith("custom:")) {
    const internalKey = destinationField.replace("custom:", "");
    let fieldId = input.customFieldIdCache?.get(internalKey) ?? null;
    if (!fieldId) {
      const { data: field, error: fieldError } = await supabase
        .from("contact_custom_fields")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("module", "contacts")
        .eq("internal_key", internalKey)
        .eq("is_active", true)
        .maybeSingle();
      if (fieldError) throw fieldError;
      fieldId = field?.id ? String(field.id) : null;
      input.customFieldIdCache?.set(internalKey, fieldId);
    }
    if (!fieldId) return [];

    const exactResult = await supabase
      .from("contact_custom_field_values")
      .select("contact_id,value_text")
      .eq("organization_id", input.organizationId)
      .eq("custom_field_id", fieldId)
      .eq("value_text", keyValue)
      .limit(5);
    if (exactResult.error) throw exactResult.error;
    const exactMatches = Array.from(
      new Set((exactResult.data ?? []).map((row) => String(row.contact_id)))
    );
    if (exactMatches.length > 0) return exactMatches;

    const { data: valueRows, error: valuesError } = await supabase
      .from("contact_custom_field_values")
      .select("contact_id,value_text")
      .eq("organization_id", input.organizationId)
      .eq("custom_field_id", fieldId)
      .ilike("value_text", keyValue)
      .limit(5);
    if (valuesError) throw valuesError;
    return Array.from(new Set((valueRows ?? []).map((row) => String(row.contact_id))));
  }

  const exactResult = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq(destinationField, keyValue)
    .limit(5);
  if (exactResult.error) throw exactResult.error;
  if ((exactResult.data ?? []).length > 0) {
    return (exactResult.data ?? []).map((row) => String(row.id));
  }

  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", input.organizationId)
    .ilike(destinationField, keyValue)
    .limit(5);
  if (error) throw error;
  return (data ?? []).map((row) => String(row.id));
}

async function buildRerunMatchPrefetch(input: {
  organizationId: string;
  rows: Array<Record<string, unknown>>;
  rerun: ReimportMatchSettings;
}) {
  const sourceColumn = toText(input.rerun.sourceMatchColumn);
  const destinationField = toText(input.rerun.destinationMatchField);
  const prefetch = new Map<string, string[]>();
  if (!input.rerun.enabled || !sourceColumn || !destinationField) return prefetch;

  const normalizedKeys = Array.from(
    new Set(
      input.rows
        .map((row) => normalizeMatchValue(destinationField, row[sourceColumn]))
        .filter(Boolean)
    )
  );
  if (normalizedKeys.length === 0) return prefetch;

  // Phone values are normalized in-memory, so direct column "in" lookups are unreliable.
  if (
    destinationField === "phone" ||
    destinationField === "mobile_number" ||
    destinationField === "alternate_phone"
  ) {
    return prefetch;
  }

  const pushMatch = (normalizedKey: string, contactId: string) => {
    if (!normalizedKey || !contactId) return;
    if (!prefetch.has(normalizedKey)) prefetch.set(normalizedKey, []);
    const current = prefetch.get(normalizedKey) ?? [];
    if (!current.includes(contactId)) current.push(contactId);
    prefetch.set(normalizedKey, current);
  };

  const supabase = await resolveImportCenterSupabaseClient();
  if (destinationField.startsWith("custom:")) {
    const internalKey = destinationField.replace("custom:", "");
    const { data: field, error: fieldError } = await supabase
      .from("contact_custom_fields")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("module", "contacts")
      .eq("internal_key", internalKey)
      .eq("is_active", true)
      .maybeSingle();
    if (fieldError) throw fieldError;
    if (!field?.id) return prefetch;

    for (const batch of chunkArray(normalizedKeys, 500)) {
      const { data: valueRows, error: valuesError } = await supabase
        .from("contact_custom_field_values")
        .select("contact_id,value_text")
        .eq("organization_id", input.organizationId)
        .eq("custom_field_id", String(field.id))
        .in("value_text", batch)
        .limit(200000);
      if (valuesError) throw valuesError;
      for (const row of valueRows ?? []) {
        pushMatch(
          normalizeMatchValue(destinationField, row.value_text),
          toText(row.contact_id)
        );
      }
    }
    return prefetch;
  }

  for (const batch of chunkArray(normalizedKeys, 500)) {
    const { data, error } = await supabase
      .from("contacts")
      .select(`id,${destinationField}`)
      .eq("organization_id", input.organizationId)
      .in(destinationField, batch)
      .limit(200000);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    for (const record of rows) {
      pushMatch(
        normalizeMatchValue(destinationField, record[destinationField]),
        toText(record.id)
      );
    }
  }
  return prefetch;
}

function buildUpdatedStandardPayload(input: {
  existing: Record<string, unknown>;
  incoming: Record<string, unknown>;
  onMatchBehavior: ReimportMatchSettings["onMatchBehavior"];
}) {
  const update: Record<string, unknown> = {};
  for (const [key, incomingValue] of Object.entries(input.incoming)) {
    if (key === "organization_id" || key === "created_by") continue;
    const existingValue = input.existing[key];
    const incomingBlank = isBlankImportValue(incomingValue);
    const existingBlank = isBlankImportValue(existingValue);

    if (input.onMatchBehavior === "skip_existing") continue;
    if (input.onMatchBehavior === "overwrite_existing") {
      if (!incomingBlank) update[key] = incomingValue;
      continue;
    }
    if (input.onMatchBehavior === "update_blank_only") {
      if (existingBlank && !incomingBlank) update[key] = incomingValue;
    }
  }
  return update;
}

async function getExistingCustomFieldValueMap(input: {
  organizationId: string;
  contactId: string;
  customFieldIds: string[];
}) {
  const supabase = await resolveImportCenterSupabaseClient();
  if (input.customFieldIds.length === 0) return new Map<string, string>();
  const { data, error } = await supabase
    .from("contact_custom_field_values")
    .select("custom_field_id,value_text")
    .eq("organization_id", input.organizationId)
    .eq("contact_id", input.contactId)
    .in("custom_field_id", input.customFieldIds);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.custom_field_id), toText(row.value_text));
  }
  return map;
}

async function resolveContactDuplicate(input: {
  organizationId: string;
  row: Record<string, unknown>;
  standard: Record<string, unknown>;
  mappings: ImportCenterMapping[];
}) {
  const supabase = await resolveImportCenterSupabaseClient();
  const externalId = toText(input.standard.external_source_id).toLowerCase();
  if (externalId) {
    const { data: externalExactMatch } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("external_source", "import_center")
      .eq("external_source_id", externalId)
      .maybeSingle();
    if (externalExactMatch?.id) {
      return { duplicate: false, existingId: String(externalExactMatch.id), byExternalId: true };
    }

    const { data: externalMatch } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("external_source", "import_center")
      .ilike("external_source_id", externalId)
      .maybeSingle();
    if (externalMatch?.id) {
      return { duplicate: false, existingId: String(externalMatch.id), byExternalId: true };
    }
  }

  const emailMapping = input.mappings.find(
    (mapping) => mapping.targetType === "standard" && mapping.targetKey === "email"
  );
  if (emailMapping) {
    const email = toText(input.row[emailMapping.sourceHeader]).toLowerCase();
    if (email) {
      const { data: emailExactMatch } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("email", email)
        .limit(1)
        .maybeSingle();
      if (emailExactMatch?.id) {
        return { duplicate: true, existingId: String(emailExactMatch.id), reason: "Duplicate email match" };
      }

      const { data: emailMatch } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", input.organizationId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (emailMatch?.id) {
        return { duplicate: true, existingId: String(emailMatch.id), reason: "Duplicate email match" };
      }
    }
  }

  const firstName = toText(input.standard.first_name).toLowerCase();
  const lastName = toText(input.standard.last_name).toLowerCase();
  const phone = normalizePhone(input.standard.phone);
  if (firstName && lastName && phone) {
    const exactCandidatesResult = await supabase
      .from("contacts")
      .select("id,phone")
      .eq("organization_id", input.organizationId)
      .eq("first_name", firstName)
      .eq("last_name", lastName)
      .limit(25);
    if (exactCandidatesResult.error) throw exactCandidatesResult.error;
    const exactCandidates = exactCandidatesResult.data ?? [];
    const matchFromExact = exactCandidates.find((row) => normalizePhone(row.phone) === phone);
    if (matchFromExact?.id) {
      return {
        duplicate: true,
        existingId: String(matchFromExact.id),
        reason: "Duplicate first + last + phone match"
      };
    }

    const { data: candidates } = await supabase
      .from("contacts")
      .select("id,phone")
      .eq("organization_id", input.organizationId)
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
      .limit(25);
    const match = (candidates ?? []).find((row) => normalizePhone(row.phone) === phone);
    if (match?.id) {
      return {
        duplicate: true,
        existingId: String(match.id),
        reason: "Duplicate first + last + phone match"
      };
    }
  }

  return { duplicate: false, existingId: null, byExternalId: false };
}

async function ensureCustomFieldIdMap(mappings: ImportCenterMapping[]) {
  const fieldMap = new Map<string, string>();
  const customMappings = mappings.filter((mapping) => mapping.targetType === "custom");
  if (!customMappings.length) return fieldMap;

  const existingFields = await listContactCustomFields();
  for (const field of existingFields) {
    fieldMap.set(String(field.internal_key), String(field.id));
  }

  for (const mapping of customMappings) {
    const targetKey = toText(mapping.targetKey);
    if (!targetKey && !mapping.createField) continue;
    const internalKey = targetKey || sanitizeInternalKey(mapping.createField?.label ?? mapping.sourceHeader);
    if (fieldMap.has(internalKey)) continue;

    const created = await createContactCustomField({
      label: mapping.createField?.label ?? mapping.sourceHeader,
      internalKey,
      dataType: mapping.createField?.dataType ?? "text"
    });
    fieldMap.set(internalKey, String(created.id));
  }

  return fieldMap;
}

export async function listImportCenterJobs(limit = 25) {
  const { context, supabase } = await resolveImportCenterExecution();
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const { data, error } = await supabase
    .from("import_center_jobs")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return data ?? [];
}

export async function getImportCenterJob(jobId: string) {
  const { context, supabase } = await resolveImportCenterExecution();
  const { data, error } = await supabase
    .from("import_center_jobs")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", jobId)
    .single();
  if (error) throw error;
  return data;
}

export async function getImportCenterMetadata() {
  let templates: Array<Record<string, unknown>> = [];
  let customFields: Array<Record<string, unknown>> = [];
  let jobs: Array<Record<string, unknown>> = [];
  let campaigns: Array<Record<string, unknown>> = [];
  let schemaWarning: string | null = null;

  try {
    [templates, customFields, jobs, campaigns] = await Promise.all([
      listImportCenterTemplates("all"),
      listContactCustomFields(),
      listImportCenterJobs(25),
      listActiveCampaignOptions()
    ]);
  } catch (error) {
    if (isImportCenterSchemaMissingError(error)) {
      schemaWarning =
        "Import Center schema is not available in this environment yet. Run Supabase migration 202603171800 and retry.";
    } else {
      throw error;
    }
  }

  return {
    importTypes: [
      { key: "contacts", label: "Contacts Import" },
      { key: "transactions", label: "Transactions Import" }
    ],
    standardFields: CONTACT_STANDARD_FIELDS,
    transactionStandardFields: TRANSACTION_STANDARD_FIELDS,
    transactionContactCreateFields: TRANSACTION_CONTACT_CREATE_FIELDS,
    transactionContactMatchFields: TRANSACTION_CONTACT_MATCH_FIELDS,
    customFields,
    templates,
    jobs,
    campaigns,
    schemaWarning
  };
}

export async function getImportCenterMetadataByType(importType: ImportCenterType | "all" = "all") {
  const metadata = await getImportCenterMetadata();
  if (importType === "all") return metadata;
  return {
    ...metadata,
    templates: (metadata.templates ?? []).filter(
      (template) => toText((template as Record<string, unknown>).import_type) === importType
    )
  };
}

async function listActiveCampaignOptions() {
  const { context, supabase } = await resolveImportCenterExecution();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id,name,status")
    .eq("organization_id", context.organizationId)
    .eq("status", "Active")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function runContactsImport(input: ContactImportRunInput) {
  const started = await startContactsImportJob({
    fileName: input.fileName,
    totalRows: input.rows.length,
    mappings: input.mappings,
    classification: input.classification,
    templateId: input.templateId ?? null,
    tagDelimiter: input.tagDelimiter ?? null,
    duplicateHandling: input.duplicateHandling ?? "skip",
    rerunMatching: input.rerunMatching
  });

  await processContactsImportChunk({
    jobId: started.jobId,
    rows: input.rows,
    rowOffset: 0,
    mappings: input.mappings,
    classification: input.classification,
    tagDelimiter: input.tagDelimiter ?? null,
    duplicateHandling: input.duplicateHandling ?? "skip",
    rerunMatching: input.rerunMatching
  });

  const completed = await completeContactsImportJob({ jobId: started.jobId });
  const duplicatePreview = detectInFileDuplicateWarnings({
    rows: input.rows,
    mappings: input.mappings
  });
  const rerunWarnings = buildRerunMatchingWarnings({
    rows: input.rows,
    rerunMatching: normalizeRerunMatchSettings(input.rerunMatching)
  });
  return {
    ...completed,
    duplicatePreview,
    rerunWarnings
  };
}

export async function startContactsImportJob(input: {
  fileName: string;
  totalRows: number;
  mappings: ImportCenterMapping[];
  classification: ContactClassificationInput;
  templateId?: string | null;
  tagDelimiter?: string | null;
  duplicateHandling?: "skip" | "flag";
  rerunMatching?: ReimportMatchSettings;
}) {
  const { context, supabase } = await resolveImportCenterExecution();
  const tagDelimiter = toText(input.tagDelimiter) || ";";
  const rerun = normalizeRerunMatchSettings(input.rerunMatching);

  const validationErrors = validateContactImportPayload({
    rows: input.totalRows > 0 ? [{}] : [],
    mappings: input.mappings,
    classification: input.classification
  });
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(" "));
  }

  const { data: job, error } = await supabase
    .from("import_center_jobs")
    .insert({
      organization_id: context.organizationId,
      import_type: "contacts",
      file_name: input.fileName,
      template_used: input.templateId ?? null,
      uploaded_by: context.userId,
      started_at: new Date().toISOString(),
      status: "queued",
      total_rows: input.totalRows,
      mapping_configuration_snapshot: {
        mappings: input.mappings,
        summary: mappingSummary(input.mappings)
      },
      classification_snapshot: input.classification,
      tag_configuration: { delimiter: tagDelimiter },
      duplicate_handling: input.duplicateHandling ?? "skip",
      rerun_matching_enabled: rerun.enabled,
      source_match_column: rerun.sourceMatchColumn,
      destination_match_field: rerun.destinationMatchField,
      on_match_behavior: rerun.onMatchBehavior,
      on_no_match_behavior: rerun.onNoMatchBehavior,
      blank_overwrite_protection_enabled: true,
      missing_key_behavior: rerun.missingKeyBehavior,
      matched_record_count: 0,
      overwritten_record_count: 0,
      blank_only_update_count: 0,
      new_record_count: 0,
      skipped_existing_count: 0,
      missing_key_skip_count: 0,
      ambiguous_match_count: 0
    })
    .select("id")
    .single();
  if (error) throw error;

  return {
    jobId: String(job.id),
    organizationId: context.organizationId,
    userId: context.userId
  };
}

export async function processContactsImportChunk(input: {
  jobId: string;
  rows: Array<Record<string, unknown>>;
  rowOffset: number;
  mappings?: ImportCenterMapping[];
  classification?: ContactClassificationInput;
  tagDelimiter?: string | null;
  duplicateHandling?: "skip" | "flag";
  rerunMatching?: ReimportMatchSettings;
}) {
  const { context, supabase } = await resolveImportCenterExecution();

  const { data: job, error: jobError } = await supabase
    .from("import_center_jobs")
    .select(
      "id,status,total_rows,successful_rows,failed_rows,skipped_rows,processed_rows,new_tags_created,mapping_configuration_snapshot,classification_snapshot,tag_configuration,duplicate_handling,rerun_matching_enabled,source_match_column,destination_match_field,on_match_behavior,on_no_match_behavior,blank_overwrite_protection_enabled,missing_key_behavior,matched_record_count,overwritten_record_count,blank_only_update_count,new_record_count,skipped_existing_count,missing_key_skip_count,ambiguous_match_count"
    )
    .eq("organization_id", context.organizationId)
    .eq("id", input.jobId)
    .single();
  if (jobError) throw jobError;
  if (toText(job.status).startsWith("completed")) {
    throw new Error("This import job is already completed.");
  }

  const snapshot = (job.mapping_configuration_snapshot ?? {}) as Record<string, unknown>;
  const mappings =
    input.mappings && input.mappings.length > 0
      ? input.mappings
      : (Array.isArray(snapshot.mappings) ? snapshot.mappings : []) as ImportCenterMapping[];
  const classification =
    input.classification ??
    ((job.classification_snapshot ?? {
      contactType: "person",
      contactCategory: "lead"
    }) as ContactClassificationInput);
  const tagConfig = (job.tag_configuration ?? {}) as Record<string, unknown>;
  const tagDelimiter = toText(input.tagDelimiter ?? tagConfig.delimiter) || ";";
  const duplicateHandling = input.duplicateHandling ?? (toText(job.duplicate_handling) === "flag" ? "flag" : "skip");
  const rerun = normalizeRerunMatchSettings(
    input.rerunMatching ?? {
      enabled: Boolean(job.rerun_matching_enabled),
      sourceMatchColumn: toText(job.source_match_column) || null,
      destinationMatchField: toText(job.destination_match_field) || null,
      onMatchBehavior: (toText(job.on_match_behavior) as ReimportMatchSettings["onMatchBehavior"]) || "update_blank_only",
      onNoMatchBehavior: (toText(job.on_no_match_behavior) as ReimportMatchSettings["onNoMatchBehavior"]) || "create_new",
      ignoreBlankOverwrites: true,
      missingKeyBehavior:
        (toText(job.missing_key_behavior) as ReimportMatchSettings["missingKeyBehavior"]) || "skip_row"
    }
  );

  const payloadValidationErrors = validateContactImportPayload({
    rows: input.rows,
    mappings,
    classification
  });
  if (payloadValidationErrors.length > 0) {
    throw new Error(payloadValidationErrors.join(" "));
  }
  const existingCustomFields = await listContactCustomFields();
  const rerunValidationErrors = validateRerunMatchingConfig({
    rows: input.rows,
    rerunMatching: rerun,
    validDestinationFields: validDestinationMatchFields(existingCustomFields)
  });
  if (rerunValidationErrors.length > 0) {
    throw new Error(rerunValidationErrors.join(" "));
  }

  let successfulRows = 0;
  let failedRows = 0;
  let skippedRows = 0;
  let newTagsCreated = 0;
  let matchedRecordCount = 0;
  let overwrittenRecordCount = 0;
  let blankOnlyUpdateCount = 0;
  let newRecordCount = 0;
  let skippedExistingCount = 0;
  let missingKeySkipCount = 0;
  let ambiguousMatchCount = 0;
  const tagLookupCache = new Map<string, string | null>();
  const createdTagTracker = new Set<string>();
  const customFieldIdMap = await ensureCustomFieldIdMap(mappings);
  const rerunPrefetch = await buildRerunMatchPrefetch({
    organizationId: context.organizationId,
    rows: input.rows,
    rerun
  });
  const rerunCustomFieldIdCache = new Map<string, string | null>();

  async function applyMappedCustomValues(params: {
    contactId: string;
    mappedCustom: Record<string, unknown>;
    mode: "overwrite_existing" | "update_blank_only";
  }) {
    const fieldIds = Array.from(customFieldIdMap.values());
    const existingMap =
      params.mode === "update_blank_only"
        ? await getExistingCustomFieldValueMap({
            organizationId: context.organizationId,
            contactId: params.contactId,
            customFieldIds: fieldIds
          })
        : new Map<string, string>();

    for (const [internalKey, rawValue] of Object.entries(params.mappedCustom)) {
      const fieldId = customFieldIdMap.get(internalKey);
      if (!fieldId) continue;
      const valueText = toText(rawValue);
      if (!valueText) continue;
      if (params.mode === "update_blank_only" && !isBlankImportValue(existingMap.get(fieldId))) {
        continue;
      }

      const { error: fieldValueError } = await supabase.from("contact_custom_field_values").upsert(
        {
          organization_id: context.organizationId,
          contact_id: params.contactId,
          custom_field_id: fieldId,
          value_text: valueText,
          value_json: { value: valueText },
          created_by: context.userId
        },
        { onConflict: "organization_id,contact_id,custom_field_id" }
      );
      if (fieldValueError) throw fieldValueError;
    }
  }

  function relationCacheKey(value: string, transform: ResolvedImportCenterMappingTransform) {
    const normalized = transform.relatedRecord.normalizeTrim ? value.trim() : value;
    const relationKey = transform.relatedRecord.caseInsensitiveMatch
      ? normalized.toLowerCase()
      : normalized;
    return `${transform.relatedRecord.caseInsensitiveMatch ? "i" : "s"}:${transform.relatedRecord.normalizeTrim ? "t" : "r"}:${relationKey}`;
  }

  async function resolveTagIdByValue(input: {
    value: string;
    transform: ResolvedImportCenterMappingTransform;
    sourceHeader: string;
    rowIndex: number;
  }) {
    const lookupValue = input.transform.relatedRecord.normalizeTrim
      ? input.value.trim()
      : input.value;
    if (!lookupValue) return null;
    const cacheKey = relationCacheKey(lookupValue, input.transform);
    if (tagLookupCache.has(cacheKey)) {
      return tagLookupCache.get(cacheKey) ?? null;
    }

    const lookupBase = supabase
      .from("tags")
      .select("id,name")
      .eq("organization_id", context.organizationId)
      .is("parent_tag_id", null)
      .limit(1);
    const { data: existing, error: existingError } = input.transform.relatedRecord.caseInsensitiveMatch
      ? await lookupBase.ilike("name", lookupValue).maybeSingle()
      : await lookupBase.eq("name", lookupValue).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) {
      const id = String(existing.id);
      tagLookupCache.set(cacheKey, id);
      return id;
    }

    let onMissing = input.transform.relatedRecord.onMissing;
    if (input.transform.valueHandlingMode === "relation_lookup_or_create") {
      onMissing = "create";
    }

    if (onMissing === "skip_value") {
      tagLookupCache.set(cacheKey, null);
      return null;
    }
    if (onMissing === "fail_row") {
      throw new Error(
        `Tag "${lookupValue}" from column "${input.sourceHeader}" was not found (row ${input.rowIndex}).`
      );
    }

    const createName = lookupValue.trim();
    const { data: created, error: createdError } = await supabase
      .from("tags")
      .insert({
        organization_id: context.organizationId,
        name: createName,
        slug: createName,
        module: "contacts",
        is_active: true,
        created_by: context.userId,
        updated_by: context.userId
      })
      .select("id")
      .single();
    if (createdError) throw createdError;
    const createdId = String(created.id);
    tagLookupCache.set(cacheKey, createdId);
    if (!createdTagTracker.has(createdId)) {
      createdTagTracker.add(createdId);
      newTagsCreated += 1;
    }
    return createdId;
  }

  async function applyMappedTags(
    contactId: string,
    tagMappings: Array<{
      sourceHeader: string;
      rawValue: unknown;
      transform: ResolvedImportCenterMappingTransform;
    }>,
    rowIndex: number
  ) {
    if (tagMappings.length === 0) return;
    let replaceExisting = false;
    const tagIds = new Set<string>();

    for (const mappedTag of tagMappings) {
      const transform = resolveMappingTransform({
        mapping: {
          sourceHeader: mappedTag.sourceHeader,
          targetType: "tags",
          targetKey: "tags",
          transform: mappedTag.transform
        },
        fallbackDelimiter: tagDelimiter
      });
      if (transform.applyBehavior === "replace") {
        replaceExisting = true;
      }

      const values = tokenizeMappedValue({
        rawValue: mappedTag.rawValue,
        transform,
        fallbackDelimiter: tagDelimiter
      });
      for (const value of values) {
        const tagId = await resolveTagIdByValue({
          value,
          transform,
          sourceHeader: mappedTag.sourceHeader,
          rowIndex
        });
        if (tagId) {
          tagIds.add(tagId);
        }
      }
    }

    if (replaceExisting) {
      const { error: deleteError } = await supabase
        .from("contact_tags")
        .delete()
        .eq("organization_id", context.organizationId)
        .eq("contact_id", contactId);
      if (deleteError) throw deleteError;
    }

    if (tagIds.size === 0) return;
    const tagRows = Array.from(tagIds).map((tagId) => ({
      organization_id: context.organizationId,
      contact_id: contactId,
      tag_id: tagId,
      assigned_by: context.userId,
      assignment_source: "import" as const
    }));
    const { error: tagAssignError } = await supabase.from("contact_tags").upsert(tagRows, {
      onConflict: "organization_id,contact_id,tag_id",
      ignoreDuplicates: true
    });
    if (tagAssignError) throw tagAssignError;
  }

  for (const [index, row] of input.rows.entries()) {
    const rowIndex = input.rowOffset + index + 1;
    try {
      const mapped = mapRowToTargets(row, mappings);
      const identity = resolveContactIdentityFields({
        classification,
        standard: mapped.standard
      });
      if (!identity.ok) {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: identity.errorMessage,
          rawRow: row
        });
        continue;
      }

      const incomingPayload = {
        organization_id: context.organizationId,
        first_name: identity.firstName,
        last_name: identity.lastName,
        preferred_name: toText(mapped.standard.preferred_name) || null,
        organization_name: identity.organizationName,
        entity_type: classification.contactType,
        tracking_status: classification.contactCategory,
        donor_status: donorStatusForCategory(classification.contactCategory),
        email: toText(mapped.standard.email).toLowerCase() || null,
        alternate_email: toText(mapped.standard.alternate_email).toLowerCase() || null,
        phone: toText(mapped.standard.phone) || null,
        mobile_number: toText(mapped.standard.mobile_number) || null,
        alternate_phone: toText(mapped.standard.alternate_phone) || null,
        address_line_1: toText(mapped.standard.address_line_1) || null,
        address_line_2: toText(mapped.standard.address_line_2) || null,
        city: toText(mapped.standard.city) || null,
        state: toText(mapped.standard.state) || null,
        postal_code: toText(mapped.standard.postal_code) || null,
        mailing_address_line_1: toText(mapped.standard.mailing_address_line_1) || null,
        mailing_address_line_2: toText(mapped.standard.mailing_address_line_2) || null,
        mailing_city: toText(mapped.standard.mailing_city) || null,
        mailing_state: toText(mapped.standard.mailing_state) || null,
        mailing_postal_code: toText(mapped.standard.mailing_postal_code) || null,
        formal_letter_name: toText(mapped.standard.formal_letter_name) || null,
        external_source: "import_center",
        external_source_id: toText(mapped.standard.external_source_id).toLowerCase() || null,
        created_by: context.userId,
        updated_by: context.userId
      };

      let matchedContactId: string | null = null;
      if (rerun.enabled) {
        const sourceColumn = toText(rerun.sourceMatchColumn);
        const destinationField = toText(rerun.destinationMatchField);
        const keyValueRaw = sourceColumn ? toText(row[sourceColumn]) : "";
        const keyValue = normalizeMatchValue(destinationField, keyValueRaw);

        if (!keyValue) {
          if (rerun.missingKeyBehavior === "skip_row") {
            skippedRows += 1;
            missingKeySkipCount += 1;
            await appendImportCenterRowError({
              organizationId: context.organizationId,
              jobId: input.jobId,
              rowIndex,
              errorMessage: `Re-import key is blank in source column "${sourceColumn}".`,
              rawRow: row
            });
            continue;
          }
        } else {
          const prefetchedMatches = rerunPrefetch.get(keyValue);
          const matches =
            prefetchedMatches && prefetchedMatches.length > 0
              ? prefetchedMatches
              : await findContactMatchesByField({
                  organizationId: context.organizationId,
                  destinationField,
                  keyValue,
                  customFieldIdCache: rerunCustomFieldIdCache
                });
          if (matches.length > 1) {
            failedRows += 1;
            ambiguousMatchCount += 1;
            await appendImportCenterRowError({
              organizationId: context.organizationId,
              jobId: input.jobId,
              rowIndex,
              errorMessage: `Ambiguous re-import match. Multiple CRM records matched key "${keyValue}".`,
              rawRow: row
            });
            continue;
          }
          if (matches.length === 1) {
            matchedContactId = matches[0];
            matchedRecordCount += 1;
          }
        }
      }

      if (matchedContactId) {
        if (rerun.onMatchBehavior === "skip_existing") {
          skippedRows += 1;
          skippedExistingCount += 1;
          continue;
        }

        const { data: existing, error: existingError } = await supabase
          .from("contacts")
          .select("*")
          .eq("organization_id", context.organizationId)
          .eq("id", matchedContactId)
          .single();
        if (existingError) throw existingError;

        const updates = buildUpdatedStandardPayload({
          existing: (existing ?? {}) as Record<string, unknown>,
          incoming: incomingPayload,
          onMatchBehavior: rerun.onMatchBehavior
        });
        if (Object.keys(updates).length > 0) {
          updates.updated_by = context.userId;
          const { error: updateError } = await supabase
            .from("contacts")
            .update(updates)
            .eq("organization_id", context.organizationId)
            .eq("id", matchedContactId);
          if (updateError) throw updateError;
        }

        await applyMappedCustomValues({
          contactId: matchedContactId,
          mappedCustom: mapped.custom,
          mode: rerun.onMatchBehavior === "update_blank_only" ? "update_blank_only" : "overwrite_existing"
        });
        await applyMappedTags(matchedContactId, mapped.tags, rowIndex);

        if (rerun.onMatchBehavior === "overwrite_existing") overwrittenRecordCount += 1;
        if (rerun.onMatchBehavior === "update_blank_only") blankOnlyUpdateCount += 1;
        successfulRows += 1;
        continue;
      }

      if (rerun.enabled && rerun.onNoMatchBehavior === "skip_row") {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: "No existing CRM match was found for this re-import key.",
          rawRow: row
        });
        continue;
      }

      const duplicate = await resolveContactDuplicate({
        organizationId: context.organizationId,
        row,
        standard: mapped.standard,
        mappings
      });
      if (duplicate.duplicate) {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage:
            duplicateHandling === "flag"
              ? `Flagged duplicate: ${duplicate.reason}`
              : `Skipped duplicate: ${duplicate.reason}`,
          rawRow: row
        });
        continue;
      }

      let contactId = duplicate.existingId;
      if (contactId && duplicate.byExternalId) {
        const { data: existing, error: existingError } = await supabase
          .from("contacts")
          .select("*")
          .eq("organization_id", context.organizationId)
          .eq("id", contactId)
          .single();
        if (existingError) throw existingError;
        const updates = buildUpdatedStandardPayload({
          existing: (existing ?? {}) as Record<string, unknown>,
          incoming: incomingPayload,
          onMatchBehavior: "overwrite_existing"
        });
        if (Object.keys(updates).length > 0) {
          updates.updated_by = context.userId;
          const { error: updateError } = await supabase
            .from("contacts")
            .update(updates)
            .eq("organization_id", context.organizationId)
            .eq("id", contactId);
          if (updateError) throw updateError;
        }
        await applyMappedCustomValues({
          contactId,
          mappedCustom: mapped.custom,
          mode: "overwrite_existing"
        });
        await applyMappedTags(contactId, mapped.tags, rowIndex);
        overwrittenRecordCount += 1;
        matchedRecordCount += 1;
        successfulRows += 1;
        continue;
      } else {
        const { data: created, error: insertError } = await supabase
          .from("contacts")
          .insert(incomingPayload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        contactId = String(created.id);
      }

      await applyMappedCustomValues({
        contactId,
        mappedCustom: mapped.custom,
        mode: "overwrite_existing"
      });
      await applyMappedTags(contactId, mapped.tags, rowIndex);
      newRecordCount += 1;
      successfulRows += 1;
    } catch (error) {
      failedRows += 1;
      await appendImportCenterRowError({
        organizationId: context.organizationId,
        jobId: input.jobId,
        rowIndex,
        errorMessage:
          error instanceof Error ? error.message : "Unexpected error while importing contact row.",
        rawRow: row
      });
    }
  }

  const cumulative = {
    successfulRows: Number(job.successful_rows ?? 0) + successfulRows,
    failedRows: Number(job.failed_rows ?? 0) + failedRows,
    skippedRows: Number(job.skipped_rows ?? 0) + skippedRows,
    newTagsCreated: Number(job.new_tags_created ?? 0) + newTagsCreated,
    matchedRecordCount: Number(job.matched_record_count ?? 0) + matchedRecordCount,
    overwrittenRecordCount: Number(job.overwritten_record_count ?? 0) + overwrittenRecordCount,
    blankOnlyUpdateCount: Number(job.blank_only_update_count ?? 0) + blankOnlyUpdateCount,
    newRecordCount: Number(job.new_record_count ?? 0) + newRecordCount,
    skippedExistingCount: Number(job.skipped_existing_count ?? 0) + skippedExistingCount,
    missingKeySkipCount: Number(job.missing_key_skip_count ?? 0) + missingKeySkipCount,
    ambiguousMatchCount: Number(job.ambiguous_match_count ?? 0) + ambiguousMatchCount
  };
  const processedRows = Math.min(
    Number(job.total_rows ?? 0),
    cumulative.successfulRows + cumulative.failedRows + cumulative.skippedRows
  );

  const { error: updateError } = await supabase
    .from("import_center_jobs")
    .update({
      status: "processing",
      processed_rows: processedRows,
      successful_rows: cumulative.successfulRows,
      failed_rows: cumulative.failedRows,
      skipped_rows: cumulative.skippedRows,
      new_tags_created: cumulative.newTagsCreated,
      matched_record_count: cumulative.matchedRecordCount,
      overwritten_record_count: cumulative.overwrittenRecordCount,
      blank_only_update_count: cumulative.blankOnlyUpdateCount,
      new_record_count: cumulative.newRecordCount,
      skipped_existing_count: cumulative.skippedExistingCount,
      missing_key_skip_count: cumulative.missingKeySkipCount,
      ambiguous_match_count: cumulative.ambiguousMatchCount,
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("id", input.jobId);
  if (updateError) throw updateError;

  return {
    jobId: input.jobId,
    chunk: {
      successfulRows,
      failedRows,
      skippedRows,
      newTagsCreated,
      matchedRecordCount,
      overwrittenRecordCount,
      blankOnlyUpdateCount,
      newRecordCount,
      skippedExistingCount,
      missingKeySkipCount,
      ambiguousMatchCount
    },
    cumulative
  };
}

export async function completeContactsImportJob(input: { jobId: string }) {
  const { context, supabase } = await resolveImportCenterExecution();

  const { data: job, error: jobError } = await supabase
    .from("import_center_jobs")
    .select(
      "id,total_rows,successful_rows,failed_rows,skipped_rows,new_tags_created,rerun_matching_enabled,source_match_column,destination_match_field,on_match_behavior,on_no_match_behavior,blank_overwrite_protection_enabled,matched_record_count,overwritten_record_count,blank_only_update_count,new_record_count,skipped_existing_count,missing_key_skip_count,ambiguous_match_count"
    )
    .eq("organization_id", context.organizationId)
    .eq("id", input.jobId)
    .single();
  if (jobError) throw jobError;

  const failedRows = Number(job.failed_rows ?? 0);
  const skippedRows = Number(job.skipped_rows ?? 0);
  const status = failedRows > 0 ? "completed_with_errors" : "completed";

  const { error: finalizeError } = await supabase
    .from("import_center_jobs")
    .update({
      status,
      processed_rows:
        Number(job.successful_rows ?? 0) + Number(job.failed_rows ?? 0) + Number(job.skipped_rows ?? 0),
      completed_at: new Date().toISOString(),
      error_log_location: failedRows + skippedRows > 0 ? `import_center_job_errors:${input.jobId}` : null
    })
    .eq("organization_id", context.organizationId)
    .eq("id", input.jobId);
  if (finalizeError) throw finalizeError;

  await logImportCenterAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    actionType: "import_center_contacts_run",
    targetEntityType: "import_center_jobs",
    targetEntityId: input.jobId,
    metadata: {
      totalRows: Number(job.total_rows ?? 0),
      successfulRows: Number(job.successful_rows ?? 0),
      failedRows,
      skippedRows,
      newTagsCreated: Number(job.new_tags_created ?? 0),
      rerunMatchingEnabled: Boolean(job.rerun_matching_enabled),
      sourceMatchColumn: toText(job.source_match_column) || null,
      destinationMatchField: toText(job.destination_match_field) || null,
      onMatchBehavior: toText(job.on_match_behavior) || null,
      onNoMatchBehavior: toText(job.on_no_match_behavior) || null,
      blankOverwriteProtectionEnabled: Boolean(job.blank_overwrite_protection_enabled),
      matchedRecordCount: Number(job.matched_record_count ?? 0),
      overwrittenRecordCount: Number(job.overwritten_record_count ?? 0),
      blankOnlyUpdateCount: Number(job.blank_only_update_count ?? 0),
      newRecordCount: Number(job.new_record_count ?? 0),
      skippedExistingCount: Number(job.skipped_existing_count ?? 0),
      missingKeySkipCount: Number(job.missing_key_skip_count ?? 0),
      ambiguousMatchCount: Number(job.ambiguous_match_count ?? 0)
    }
  });

  return {
    jobId: input.jobId,
    totalRows: Number(job.total_rows ?? 0),
    successfulRows: Number(job.successful_rows ?? 0),
    failedRows,
    skippedRows,
    newTagsCreated: Number(job.new_tags_created ?? 0),
    rerunMatchingEnabled: Boolean(job.rerun_matching_enabled),
    sourceMatchColumn: toText(job.source_match_column) || null,
    destinationMatchField: toText(job.destination_match_field) || null,
    onMatchBehavior: toText(job.on_match_behavior) || null,
    onNoMatchBehavior: toText(job.on_no_match_behavior) || null,
    blankOverwriteProtectionEnabled: Boolean(job.blank_overwrite_protection_enabled),
    matchedRecordCount: Number(job.matched_record_count ?? 0),
    overwrittenRecordCount: Number(job.overwritten_record_count ?? 0),
    blankOnlyUpdateCount: Number(job.blank_only_update_count ?? 0),
    newRecordCount: Number(job.new_record_count ?? 0),
    skippedExistingCount: Number(job.skipped_existing_count ?? 0),
    missingKeySkipCount: Number(job.missing_key_skip_count ?? 0),
    ambiguousMatchCount: Number(job.ambiguous_match_count ?? 0)
  };
}

export async function listImportCenterJobErrors(jobId: string) {
  const { context, supabase } = await resolveImportCenterExecution();

  const { data, error } = await supabase
    .from("import_center_job_errors")
    .select("row_index,error_message,raw_row")
    .eq("organization_id", context.organizationId)
    .eq("import_center_job_id", jobId)
    .order("row_index", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
