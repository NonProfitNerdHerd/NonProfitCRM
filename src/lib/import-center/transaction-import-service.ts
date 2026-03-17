import { createClient } from "@/lib/supabase/server";
import { requireImportCenterAccess } from "@/lib/auth/guards";
import { mappingSummary } from "@/lib/import-center/field-mapping-engine";
import { appendImportCenterRowError, logImportCenterAudit } from "@/lib/import-center/logging-service";
import type { ImportCenterMapping, TransactionImportConfig } from "@/lib/import-center/types";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown) {
  return toText(value).replace(/\D+/g, "");
}

function normalizeCampaignValue(value: unknown) {
  return toText(value).toLowerCase();
}

function donorStatusForCategory(category: "lead" | "donor" | "non_lead") {
  if (category === "donor") return "active";
  if (category === "non_lead") return "inactive";
  return "prospect";
}

function normalizeTransactionConfig(
  input?: Partial<TransactionImportConfig> | null
): TransactionImportConfig {
  const legacyCreateMissingContact =
    input && Object.prototype.hasOwnProperty.call(input, "createMissingContact")
      ? (input as { createMissingContact?: boolean }).createMissingContact !== false
      : true;
  return {
    contactMatchSourceColumn: toText(input?.contactMatchSourceColumn) || null,
    contactMatchField: (toText(input?.contactMatchField) as TransactionImportConfig["contactMatchField"]) || "email",
    onNoContactMatch:
      input?.onNoContactMatch === "skip_row"
        ? "skip_row"
        : legacyCreateMissingContact
          ? "create_contact"
          : "skip_row",
    newContactType: input?.newContactType === "organization" ? "organization" : "person",
    newContactCategory:
      input?.newContactCategory === "lead" || input?.newContactCategory === "non_lead"
        ? input.newContactCategory
        : "donor",
    campaignSourceColumn: toText(input?.campaignSourceColumn) || null,
    campaignValueMap:
      input?.campaignValueMap && typeof input.campaignValueMap === "object"
        ? Object.fromEntries(
            Object.entries(input.campaignValueMap)
              .map(([sourceValue, campaignId]) => [
                normalizeCampaignValue(sourceValue),
                toText(campaignId)
              ])
              .filter((entry) => Boolean(entry[0]) && Boolean(entry[1]))
          )
        : {}
  };
}

function parseAmount(value: unknown) {
  const numeric = Number(String(value ?? "").replace(/[,$\s]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100) / 100;
}

function parseDateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = toText(value);
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (Number.isFinite(serial) && serial > 0) {
      const millis = Date.UTC(1899, 11, 30) + serial * 24 * 60 * 60 * 1000;
      const excelDate = new Date(millis);
      if (!Number.isNaN(excelDate.getTime())) return excelDate.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizePaymentType(value: unknown): "Cash" | "Check" | "Card" | null {
  const text = toText(value).toLowerCase();
  if (!text) return "Cash";
  if (text.includes("check")) return "Check";
  if (
    text.includes("card") ||
    text.includes("credit") ||
    text.includes("debit") ||
    text.includes("visa") ||
    text.includes("master")
  ) {
    return "Card";
  }
  if (text.includes("cash")) return "Cash";
  return null;
}

function parseCampaignAction(action: string) {
  const normalized = toText(action);
  if (normalized.startsWith("campaign:")) {
    return { type: "campaign" as const, campaignId: normalized.replace("campaign:", "").trim() };
  }
  if (normalized.startsWith("create:")) {
    return { type: "create" as const, campaignName: normalized.replace("create:", "").trim() };
  }
  if (normalized) {
    // Backward compatibility with old templates that stored raw campaign id.
    return { type: "campaign" as const, campaignId: normalized };
  }
  return null;
}

function mapTransactionRowToTargets(row: Record<string, unknown>, mappings: ImportCenterMapping[]) {
  const transaction: Record<string, unknown> = {};
  const contact: Record<string, unknown> = {};

  for (const mapping of mappings) {
    if (mapping.targetType === "unmapped" || !mapping.targetKey) continue;
    if (mapping.targetType !== "standard") continue;

    const value = row[mapping.sourceHeader];
    if (mapping.targetKey.startsWith("transaction:")) {
      transaction[mapping.targetKey.replace("transaction:", "")] = value;
      continue;
    }
    if (mapping.targetKey.startsWith("contact:")) {
      contact[mapping.targetKey.replace("contact:", "")] = value;
    }
  }

  return { transaction, contact };
}

function validateTransactionImportPayload(input: {
  rows: Array<Record<string, unknown>>;
  mappings: ImportCenterMapping[];
  config: TransactionImportConfig;
}) {
  const errors: string[] = [];
  if (!input.rows.length) errors.push("The uploaded file does not contain any data rows.");
  if (!input.mappings.length) errors.push("No column mappings were provided.");

  const mappedTargets = new Set(
    input.mappings
      .filter((mapping) => mapping.targetType === "standard" && mapping.targetKey)
      .map((mapping) => String(mapping.targetKey))
  );
  if (!mappedTargets.has("transaction:amount")) {
    errors.push("Donation Amount must be mapped before import.");
  }
  if (!mappedTargets.has("transaction:donation_date")) {
    errors.push("Donation Date must be mapped before import.");
  }

  const sourceColumn = toText(input.config.contactMatchSourceColumn);
  if (!sourceColumn) {
    errors.push("Contact match source column is required.");
  } else if (input.rows.length > 0 && !(sourceColumn in input.rows[0])) {
    errors.push(`Contact match source column "${sourceColumn}" was not found in the uploaded file.`);
  }

  const campaignSource = toText(input.config.campaignSourceColumn);
  if (!campaignSource) {
    errors.push("Campaign source column is required.");
  } else if (input.rows.length > 0 && !(campaignSource in input.rows[0])) {
    errors.push(`Campaign source column "${campaignSource}" was not found in the uploaded file.`);
  } else {
    const missingValues = new Set<string>();
    const invalidActions = new Set<string>();
    for (const row of input.rows) {
      const rawValue = toText(row[campaignSource]);
      if (!rawValue) continue;
      const normalized = normalizeCampaignValue(rawValue);
      const action = toText(input.config.campaignValueMap[normalized]);
      if (!action) {
        missingValues.add(rawValue);
        continue;
      }
      if (!action.startsWith("campaign:") && !action.startsWith("create:")) {
        invalidActions.add(`${rawValue} -> ${action}`);
      }
    }
    if (missingValues.size > 0) {
      const sample = Array.from(missingValues).slice(0, 5).join(", ");
      errors.push(
        `Campaign mapping is incomplete. Map all source campaign values before import (for example: ${sample}).`
      );
    }
    if (invalidActions.size > 0) {
      const sample = Array.from(invalidActions).slice(0, 5).join(", ");
      errors.push(
        `Campaign mapping contains invalid actions. Use existing campaign or create new campaign options (for example: ${sample}).`
      );
    }
  }

  return errors;
}

async function findContactMatches(input: {
  organizationId: string;
  matchField: TransactionImportConfig["contactMatchField"];
  value: string;
}) {
  const supabase = await createClient();
  const matchField = toText(input.matchField);

  if (matchField.startsWith("custom:")) {
    const internalKey = matchField.replace("custom:", "");
    const normalized = toText(input.value).toLowerCase();
    if (!internalKey || !normalized) return [];

    const { data: field, error: fieldError } = await supabase
      .from("contact_custom_fields")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("module", "contacts")
      .eq("internal_key", internalKey)
      .eq("is_active", true)
      .maybeSingle();
    if (fieldError) throw fieldError;
    if (!field?.id) return [];

    const { data: valueRows, error: valuesError } = await supabase
      .from("contact_custom_field_values")
      .select("contact_id,value_text")
      .eq("organization_id", input.organizationId)
      .eq("custom_field_id", String(field.id))
      .ilike("value_text", normalized)
      .limit(5);
    if (valuesError) throw valuesError;
    return Array.from(new Set((valueRows ?? []).map((row) => String(row.contact_id))));
  }

  if (
    matchField === "email" ||
    matchField === "alternate_email" ||
    matchField === "external_source_id"
  ) {
    const normalized = toText(input.value).toLowerCase();
    if (!normalized) return [];
    const { data, error } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .ilike(matchField, normalized)
      .limit(5);
    if (error) throw error;
    return (data ?? []).map((row) => String(row.id));
  }

  const normalizedPhone = normalizePhone(input.value);
  if (!normalizedPhone) return [];
  const { data, error } = await supabase
    .from("contacts")
    .select("id,phone,mobile_number,alternate_phone")
    .eq("organization_id", input.organizationId)
    .or(
      `phone.ilike.%${normalizedPhone}%,mobile_number.ilike.%${normalizedPhone}%,alternate_phone.ilike.%${normalizedPhone}%`
    )
    .limit(50);
  if (error) throw error;

  const matches = (data ?? []).filter((row) => {
    if (matchField === "phone") return normalizePhone(row.phone) === normalizedPhone;
    if (matchField === "mobile_number") return normalizePhone(row.mobile_number) === normalizedPhone;
    return normalizePhone(row.alternate_phone) === normalizedPhone;
  });
  return matches.map((row) => String(row.id));
}

async function createContactForTransaction(input: {
  organizationId: string;
  userId: string;
  matchField: TransactionImportConfig["contactMatchField"];
  matchValue: string;
  config: TransactionImportConfig;
  mappedContact: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const inferredEmail =
    input.matchField === "email" || input.matchField === "alternate_email"
      ? toText(input.matchValue).toLowerCase()
      : "";
  const inferredPhone =
    input.matchField === "phone" ||
    input.matchField === "mobile_number" ||
    input.matchField === "alternate_phone"
      ? toText(input.matchValue)
      : "";
  const inferredExternalSourceId =
    input.matchField === "external_source_id" ? toText(input.matchValue).toLowerCase() : "";

  const configuredOrgName = toText(input.mappedContact.organization_name);
  const configuredFirstName = toText(input.mappedContact.first_name);
  const configuredLastName = toText(input.mappedContact.last_name);

  const email =
    toText(input.mappedContact.email).toLowerCase() ||
    inferredEmail ||
    (input.config.newContactType === "organization" ? "" : "");
  const phone = toText(input.mappedContact.phone) || inferredPhone;
  const externalSourceId =
    toText(input.mappedContact.external_source_id).toLowerCase() || inferredExternalSourceId;

  const organizationName =
    input.config.newContactType === "organization"
      ? configuredOrgName || toText(input.matchValue) || "Imported Organization"
      : configuredOrgName || null;

  const firstName =
    input.config.newContactType === "organization"
      ? organizationName || "Imported Organization"
      : configuredFirstName ||
        (email.includes("@") ? email.split("@")[0] : "") ||
        toText(input.matchValue) ||
        "Imported";
  const lastName =
    input.config.newContactType === "organization" ? "(Organization)" : configuredLastName || "(Imported)";

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      organization_id: input.organizationId,
      first_name: firstName,
      last_name: lastName,
      preferred_name: null,
      organization_name: organizationName,
      entity_type: input.config.newContactType,
      tracking_status: input.config.newContactCategory,
      donor_status: donorStatusForCategory(input.config.newContactCategory),
      email: email || null,
      phone: phone || null,
      external_source: "import_center_transactions",
      external_source_id: externalSourceId || null,
      created_by: input.userId,
      updated_by: input.userId
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function startTransactionsImportJob(input: {
  fileName: string;
  totalRows: number;
  mappings: ImportCenterMapping[];
  templateId?: string | null;
  config: TransactionImportConfig;
}) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();
  const config = normalizeTransactionConfig(input.config);

  const { data: job, error } = await supabase
    .from("import_center_jobs")
    .insert({
      organization_id: context.organizationId,
      import_type: "transactions",
      file_name: input.fileName,
      template_used: input.templateId ?? null,
      uploaded_by: context.userId,
      started_at: new Date().toISOString(),
      status: "running",
      total_rows: input.totalRows,
      mapping_configuration_snapshot: {
        mappings: input.mappings,
        summary: mappingSummary(input.mappings)
      },
      classification_snapshot: {
        transactionConfig: config
      },
      tag_configuration: {},
      duplicate_handling: "skip",
      matched_contact_count: 0,
      created_contact_count: 0,
      created_transaction_count: 0,
      no_contact_match_skip_count: 0,
      campaign_mapped_count: 0,
      campaign_unmapped_skip_count: 0,
      ambiguous_contact_match_count: 0
    })
    .select("id")
    .single();
  if (error) throw error;

  return { jobId: String(job.id) };
}

export async function processTransactionsImportChunk(input: {
  jobId: string;
  rows: Array<Record<string, unknown>>;
  rowOffset: number;
  mappings?: ImportCenterMapping[];
  config?: TransactionImportConfig;
}) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("import_center_jobs")
    .select(
      "id,status,successful_rows,failed_rows,skipped_rows,total_rows,mapping_configuration_snapshot,classification_snapshot,matched_contact_count,created_contact_count,created_transaction_count,no_contact_match_skip_count,campaign_mapped_count,campaign_unmapped_skip_count,ambiguous_contact_match_count"
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
  const configSnapshot = (job.classification_snapshot ?? {}) as Record<string, unknown>;
  const config = normalizeTransactionConfig(
    input.config ??
      ((configSnapshot.transactionConfig ?? configSnapshot) as Partial<TransactionImportConfig>)
  );

  const payloadValidationErrors = validateTransactionImportPayload({
    rows: input.rows,
    mappings,
    config
  });
  if (payloadValidationErrors.length > 0) {
    throw new Error(payloadValidationErrors.join(" "));
  }

  const campaignIdSet = new Set<string>();
  for (const action of Object.values(config.campaignValueMap)) {
    const parsed = parseCampaignAction(action);
    if (parsed?.type === "campaign" && toText(parsed.campaignId)) {
      campaignIdSet.add(toText(parsed.campaignId));
    }
  }
  const campaignIds = Array.from(campaignIdSet);
  const { data: campaigns, error: campaignError } = await supabase
    .from("campaigns")
    .select("id,name")
    .eq("organization_id", context.organizationId)
    .in("id", campaignIds.length > 0 ? campaignIds : ["00000000-0000-0000-0000-000000000000"]);
  if (campaignError) throw campaignError;
  const campaignById = new Map<string, string>();
  for (const campaign of campaigns ?? []) {
    campaignById.set(String(campaign.id), String(campaign.name ?? ""));
  }
  const createdCampaignByName = new Map<string, { id: string; name: string }>();

  async function resolveCampaignForValue(sourceCampaignValue: string) {
    const action = parseCampaignAction(config.campaignValueMap[normalizeCampaignValue(sourceCampaignValue)]);
    if (!action) return null;

    if (action.type === "campaign") {
      const id = toText(action.campaignId);
      const name = campaignById.get(id);
      if (!id || !name) return null;
      return { id, name };
    }

    const requestedName = toText(action.campaignName) || toText(sourceCampaignValue);
    if (!requestedName) return null;
    const cacheKey = normalizeCampaignValue(requestedName);
    const cached = createdCampaignByName.get(cacheKey);
    if (cached) return cached;

    const { data: existingCampaign, error: existingCampaignError } = await supabase
      .from("campaigns")
      .select("id,name")
      .eq("organization_id", context.organizationId)
      .ilike("name", requestedName)
      .limit(1)
      .maybeSingle();
    if (existingCampaignError) throw existingCampaignError;
    if (existingCampaign?.id) {
      const existing = { id: String(existingCampaign.id), name: toText(existingCampaign.name) || requestedName };
      campaignById.set(existing.id, existing.name);
      createdCampaignByName.set(cacheKey, existing);
      return existing;
    }

    const { data: createdCampaign, error: createCampaignError } = await supabase
      .from("campaigns")
      .insert({
        organization_id: context.organizationId,
        name: requestedName,
        status: "Active",
        owner_user_id: context.userId,
        created_by: context.userId
      })
      .select("id,name")
      .single();
    if (createCampaignError) throw createCampaignError;

    const created = {
      id: String(createdCampaign.id),
      name: toText(createdCampaign.name) || requestedName
    };
    campaignById.set(created.id, created.name);
    createdCampaignByName.set(cacheKey, created);
    return created;
  }

  let successfulRows = 0;
  let failedRows = 0;
  let skippedRows = 0;
  let matchedContactCount = 0;
  let createdContactCount = 0;
  let createdTransactionCount = 0;
  let noContactMatchSkipCount = 0;
  let campaignMappedCount = 0;
  let campaignUnmappedSkipCount = 0;
  let ambiguousContactMatchCount = 0;

  for (const [index, row] of input.rows.entries()) {
    const rowIndex = input.rowOffset + index + 1;
    try {
      const sourceMatchColumn = toText(config.contactMatchSourceColumn);
      const matchValue = toText(row[sourceMatchColumn]);
      if (!matchValue) {
        skippedRows += 1;
        noContactMatchSkipCount += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: `Contact match key is blank in source column "${sourceMatchColumn}".`,
          rawRow: row
        });
        continue;
      }

      let contactId: string | null = null;
      const matches = await findContactMatches({
        organizationId: context.organizationId,
        matchField: config.contactMatchField,
        value: matchValue
      });
      if (matches.length > 1) {
        failedRows += 1;
        ambiguousContactMatchCount += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: `Ambiguous contact match. Multiple records matched key "${matchValue}".`,
          rawRow: row
        });
        continue;
      }
      if (matches.length === 1) {
        contactId = matches[0];
        matchedContactCount += 1;
      }

      const mapped = mapTransactionRowToTargets(row, mappings);
      if (!contactId) {
        if (config.onNoContactMatch === "skip_row") {
          skippedRows += 1;
          noContactMatchSkipCount += 1;
          await appendImportCenterRowError({
            organizationId: context.organizationId,
            jobId: input.jobId,
            rowIndex,
            errorMessage: `No contact was found for key "${matchValue}" and "Skip Row" is selected for unmatched contacts.`,
            rawRow: row
          });
          continue;
        }

        contactId = await createContactForTransaction({
          organizationId: context.organizationId,
          userId: context.userId,
          matchField: config.contactMatchField,
          matchValue,
          config,
          mappedContact: mapped.contact
        });
        createdContactCount += 1;
      }

      const rawCampaignValue = toText(row[toText(config.campaignSourceColumn)]);
      if (!rawCampaignValue) {
        skippedRows += 1;
        campaignUnmappedSkipCount += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: `Campaign value is blank in source column "${toText(config.campaignSourceColumn)}".`,
          rawRow: row
        });
        continue;
      }
      const resolvedCampaign = await resolveCampaignForValue(rawCampaignValue);
      if (!resolvedCampaign?.id) {
        skippedRows += 1;
        campaignUnmappedSkipCount += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: `Campaign "${rawCampaignValue}" was not mapped to an existing campaign and could not be created.`,
          rawRow: row
        });
        continue;
      }
      const campaignId = resolvedCampaign.id;
      campaignMappedCount += 1;

      const amount = parseAmount(mapped.transaction.amount);
      if (amount === null) {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: "Donation Amount is required and must be a positive number.",
          rawRow: row
        });
        continue;
      }
      const donationDate = parseDateValue(mapped.transaction.donation_date);
      if (!donationDate) {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: "Donation Date is required and could not be parsed.",
          rawRow: row
        });
        continue;
      }

      const paymentType = normalizePaymentType(mapped.transaction.payment_type);
      if (!paymentType) {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: "Payment Type must be Cash, Check, or Card.",
          rawRow: row
        });
        continue;
      }
      const checkNumber = toText(mapped.transaction.check_number) || null;
      const transactionId = toText(mapped.transaction.transaction_id) || null;
      if (paymentType === "Check" && !checkNumber) {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: "Check Number is required when Payment Type is Check.",
          rawRow: row
        });
        continue;
      }
      if (paymentType === "Card" && !transactionId) {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId: input.jobId,
          rowIndex,
          errorMessage: "Transaction ID is required when Payment Type is Card.",
          rawRow: row
        });
        continue;
      }

      const externalTransactionId = toText(mapped.transaction.external_transaction_id);
      const sourcePlatform = toText(mapped.transaction.source_platform) || "import_center_transactions";
      if (externalTransactionId) {
        const { data: existing } = await supabase
          .from("donations")
          .select("id")
          .eq("organization_id", context.organizationId)
          .eq("source_platform", sourcePlatform)
          .eq("external_transaction_id", externalTransactionId)
          .maybeSingle();
        if (existing?.id) {
          skippedRows += 1;
          await appendImportCenterRowError({
            organizationId: context.organizationId,
            jobId: input.jobId,
            rowIndex,
            errorMessage: `Duplicate transaction skipped (source_platform + external_transaction_id already exists).`,
            rawRow: row
          });
          continue;
        }
      }

      const isRecurringRaw = toText(mapped.transaction.is_recurring).toLowerCase();
      const isRecurring = ["true", "1", "yes", "y"].includes(isRecurringRaw);

      const { error: insertError } = await supabase.from("donations").insert({
        organization_id: context.organizationId,
        contact_id: contactId,
        campaign_id: campaignId,
        amount,
        currency: "USD",
        donation_date: donationDate,
        status: "posted",
        payment_type: paymentType,
        check_number: checkNumber,
        transaction_id: transactionId,
        memo: toText(mapped.transaction.memo) || null,
        source: "import_center",
        source_platform: sourcePlatform,
        external_transaction_id: externalTransactionId || null,
        is_recurring: isRecurring,
        campaign: resolvedCampaign.name || null,
        created_by: context.userId
      });
      if (insertError) throw insertError;

      successfulRows += 1;
      createdTransactionCount += 1;
    } catch (error) {
      failedRows += 1;
      await appendImportCenterRowError({
        organizationId: context.organizationId,
        jobId: input.jobId,
        rowIndex,
        errorMessage:
          error instanceof Error ? error.message : "Unexpected error while importing transaction row.",
        rawRow: row
      });
    }
  }

  const cumulative = {
    successfulRows: Number(job.successful_rows ?? 0) + successfulRows,
    failedRows: Number(job.failed_rows ?? 0) + failedRows,
    skippedRows: Number(job.skipped_rows ?? 0) + skippedRows,
    matchedContactCount: Number(job.matched_contact_count ?? 0) + matchedContactCount,
    createdContactCount: Number(job.created_contact_count ?? 0) + createdContactCount,
    createdTransactionCount: Number(job.created_transaction_count ?? 0) + createdTransactionCount,
    noContactMatchSkipCount: Number(job.no_contact_match_skip_count ?? 0) + noContactMatchSkipCount,
    campaignMappedCount: Number(job.campaign_mapped_count ?? 0) + campaignMappedCount,
    campaignUnmappedSkipCount:
      Number(job.campaign_unmapped_skip_count ?? 0) + campaignUnmappedSkipCount,
    ambiguousContactMatchCount:
      Number(job.ambiguous_contact_match_count ?? 0) + ambiguousContactMatchCount
  };

  const { error: updateError } = await supabase
    .from("import_center_jobs")
    .update({
      status: "running",
      successful_rows: cumulative.successfulRows,
      failed_rows: cumulative.failedRows,
      skipped_rows: cumulative.skippedRows,
      matched_contact_count: cumulative.matchedContactCount,
      created_contact_count: cumulative.createdContactCount,
      created_transaction_count: cumulative.createdTransactionCount,
      no_contact_match_skip_count: cumulative.noContactMatchSkipCount,
      campaign_mapped_count: cumulative.campaignMappedCount,
      campaign_unmapped_skip_count: cumulative.campaignUnmappedSkipCount,
      ambiguous_contact_match_count: cumulative.ambiguousContactMatchCount,
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
      matchedContactCount,
      createdContactCount,
      createdTransactionCount,
      noContactMatchSkipCount,
      campaignMappedCount,
      campaignUnmappedSkipCount,
      ambiguousContactMatchCount
    },
    cumulative
  };
}

export async function completeTransactionsImportJob(input: { jobId: string }) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from("import_center_jobs")
    .select(
      "id,total_rows,successful_rows,failed_rows,skipped_rows,matched_contact_count,created_contact_count,created_transaction_count,no_contact_match_skip_count,campaign_mapped_count,campaign_unmapped_skip_count,ambiguous_contact_match_count"
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
      completed_at: new Date().toISOString(),
      error_log_location: failedRows + skippedRows > 0 ? `import_center_job_errors:${input.jobId}` : null
    })
    .eq("organization_id", context.organizationId)
    .eq("id", input.jobId);
  if (finalizeError) throw finalizeError;

  await logImportCenterAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    actionType: "import_center_transactions_run",
    targetEntityType: "import_center_jobs",
    targetEntityId: input.jobId,
    metadata: {
      totalRows: Number(job.total_rows ?? 0),
      successfulRows: Number(job.successful_rows ?? 0),
      failedRows,
      skippedRows,
      matchedContactCount: Number(job.matched_contact_count ?? 0),
      createdContactCount: Number(job.created_contact_count ?? 0),
      createdTransactionCount: Number(job.created_transaction_count ?? 0),
      noContactMatchSkipCount: Number(job.no_contact_match_skip_count ?? 0),
      campaignMappedCount: Number(job.campaign_mapped_count ?? 0),
      campaignUnmappedSkipCount: Number(job.campaign_unmapped_skip_count ?? 0),
      ambiguousContactMatchCount: Number(job.ambiguous_contact_match_count ?? 0)
    }
  });

  return {
    jobId: input.jobId,
    totalRows: Number(job.total_rows ?? 0),
    successfulRows: Number(job.successful_rows ?? 0),
    failedRows,
    skippedRows,
    matchedContactCount: Number(job.matched_contact_count ?? 0),
    createdContactCount: Number(job.created_contact_count ?? 0),
    createdTransactionCount: Number(job.created_transaction_count ?? 0),
    noContactMatchSkipCount: Number(job.no_contact_match_skip_count ?? 0),
    campaignMappedCount: Number(job.campaign_mapped_count ?? 0),
    campaignUnmappedSkipCount: Number(job.campaign_unmapped_skip_count ?? 0),
    ambiguousContactMatchCount: Number(job.ambiguous_contact_match_count ?? 0)
  };
}
