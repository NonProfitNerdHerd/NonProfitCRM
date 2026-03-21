// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import Papa from "npm:papaparse@5.5.3";
import * as XLSX from "npm:xlsx@0.18.5";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toLower(value: unknown) {
  return toText(value).toLowerCase();
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function slugifyTag(input: unknown) {
  const slug = String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "tag";
}

function isTagSlugConflictError(error: unknown) {
  const value = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = [toText(value?.message), toText(value?.details), toText(value?.hint)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return value?.code === "23505" || (value?.code === "P0001" && message.includes("tag slug already exists"));
}

function formatImportErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = toText(error.message);
    if (message) return message;
    return fallback;
  }
  if (typeof error === "string") {
    const message = toText(error);
    return message || fallback;
  }
  if (error && typeof error === "object") {
    const value = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error?: unknown;
    };
    const parts = [toText(value.message), toText(value.details), toText(value.hint), toText(value.code)].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
    const nested = toText(value.error);
    if (nested) return nested;
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function appendLog(current: unknown, message: string, maxChars = 16000) {
  const existing = toText(current);
  const next = [existing, `${new Date().toISOString()} ${message}`].filter(Boolean).join("\n");
  if (next.length <= maxChars) return next;
  return next.slice(next.length - maxChars);
}

function getBatchSize() {
  const configured = toNumber(Deno.env.get("IMPORT_CENTER_BATCH_SIZE"), 100);
  return Math.min(Math.max(configured, 10), 250);
}

function getScheduleTimeoutMs() {
  const configured = toNumber(Deno.env.get("IMPORT_CENTER_SCHEDULE_TIMEOUT_MS"), 10000);
  return Math.min(Math.max(configured, 1500), 60000);
}

function getScheduleRetries() {
  const configured = toNumber(Deno.env.get("IMPORT_CENTER_SCHEDULE_RETRIES"), 3);
  return Math.min(Math.max(configured, 1), 6);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePhone(value: unknown) {
  return toText(value).replace(/\D+/g, "");
}

function sanitizeInternalKey(label: string) {
  const normalized = toText(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || `field_${Date.now()}`;
}

function buildDefaultMappingTransform(targetType: string) {
  if (targetType === "tags") {
    return {
      valueHandlingMode: "multi_value_split",
      split: {
        enabled: true,
        delimiterPreset: "semicolon",
        delimiterValue: ";",
        trimWhitespace: true,
        ignoreBlankValues: true
      },
      relatedRecord: {
        lookupExisting: true,
        onMissing: "create",
        caseInsensitiveMatch: true,
        normalizeTrim: true
      },
      applyBehavior: "append"
    };
  }
  return {
    valueHandlingMode: "direct_value",
    split: {
      enabled: false,
      delimiterPreset: "semicolon",
      delimiterValue: ";",
      trimWhitespace: true,
      ignoreBlankValues: true
    },
    relatedRecord: {
      lookupExisting: false,
      onMissing: "skip_value",
      caseInsensitiveMatch: true,
      normalizeTrim: true
    },
    applyBehavior: "append"
  };
}

function resolveSplitDelimiter(split: Record<string, unknown>, fallbackDelimiter?: string) {
  const fallback = toText(fallbackDelimiter) || ";";
  const preset = toText(split.delimiterPreset || "semicolon");
  if (preset === "comma") return ",";
  if (preset === "pipe") return "|";
  if (preset === "semicolon") return ";";
  return toText(split.delimiterValue) || fallback;
}

function resolveMappingTransform(mapping: Record<string, unknown>, fallbackDelimiter?: string) {
  const targetType = toText(mapping.targetType) || "standard";
  const defaults = buildDefaultMappingTransform(targetType);
  const transform = (mapping.transform ?? {}) as Record<string, unknown>;
  const split = (transform.split ?? {}) as Record<string, unknown>;
  const relatedRecord = (transform.relatedRecord ?? {}) as Record<string, unknown>;
  const resolved = {
    valueHandlingMode: toText(transform.valueHandlingMode || defaults.valueHandlingMode),
    split: {
      enabled: Boolean(split.enabled ?? defaults.split.enabled),
      delimiterPreset: toText(split.delimiterPreset || defaults.split.delimiterPreset),
      delimiterValue: toText(split.delimiterValue || defaults.split.delimiterValue) || null,
      trimWhitespace: Boolean(split.trimWhitespace ?? defaults.split.trimWhitespace),
      ignoreBlankValues: Boolean(split.ignoreBlankValues ?? defaults.split.ignoreBlankValues)
    },
    relatedRecord: {
      lookupExisting: Boolean(relatedRecord.lookupExisting ?? defaults.relatedRecord.lookupExisting),
      onMissing: toText(relatedRecord.onMissing || defaults.relatedRecord.onMissing),
      caseInsensitiveMatch: Boolean(
        relatedRecord.caseInsensitiveMatch ?? defaults.relatedRecord.caseInsensitiveMatch
      ),
      normalizeTrim: Boolean(relatedRecord.normalizeTrim ?? defaults.relatedRecord.normalizeTrim)
    },
    applyBehavior: toText(transform.applyBehavior || defaults.applyBehavior)
  };
  if (targetType === "tags" && !toText(split.delimiterValue) && fallbackDelimiter) {
    resolved.split.delimiterValue = toText(fallbackDelimiter);
  }
  if (resolved.valueHandlingMode === "multi_value_split") {
    resolved.split.enabled = true;
  }
  if (resolved.valueHandlingMode === "relation_lookup_or_create") {
    resolved.relatedRecord.lookupExisting = true;
    resolved.relatedRecord.onMissing = "create";
  }
  if (resolved.valueHandlingMode === "relation_lookup") {
    resolved.relatedRecord.lookupExisting = true;
  }
  return resolved;
}

function tokenizeMappedValue(input: {
  rawValue: unknown;
  transform: ReturnType<typeof resolveMappingTransform>;
  fallbackDelimiter?: string;
}) {
  const source = String(input.rawValue ?? "");
  const shouldSplit =
    Boolean(input.transform.split.enabled) || input.transform.valueHandlingMode === "multi_value_split";
  const delimiter = resolveSplitDelimiter(input.transform.split, input.fallbackDelimiter);
  const values = shouldSplit ? source.split(delimiter) : [source];
  const normalized = values.map((entry) =>
    input.transform.split.trimWhitespace ? entry.trim() : entry
  );
  return input.transform.split.ignoreBlankValues
    ? normalized.filter((entry) => entry.trim().length > 0)
    : normalized;
}

function isBlankImportValue(value: unknown) {
  return value === null || value === undefined || toText(value) === "";
}

function ensureEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function parseCsvRows(csvText: string) {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

function parseWorkbookRows(buffer: ArrayBuffer, preferredSheet?: string | null) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const selectedSheet =
    preferredSheet && workbook.SheetNames.includes(preferredSheet)
      ? preferredSheet
      : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
}

async function appendImportCenterRowError(input: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  jobId: string;
  rowIndex: number;
  errorMessage: string;
  rawRow: Record<string, unknown>;
}) {
  const { error } = await input.supabase.from("import_center_job_errors").insert({
    organization_id: input.organizationId,
    import_center_job_id: input.jobId,
    row_index: input.rowIndex,
    error_message: input.errorMessage,
    raw_row: input.rawRow
  });
  if (error) throw error;
}

async function heartbeat(input: {
  supabase: ReturnType<typeof createClient>;
  jobId: string;
  processedRows: number;
}) {
  const nowIso = new Date().toISOString();
  await input.supabase
    .from("import_center_jobs")
    .update({
      processed_rows: input.processedRows,
      last_processed_row: input.processedRows,
      processing_heartbeat_at: nowIso,
      last_activity_at: nowIso
    })
    .eq("id", input.jobId);
}

async function markJobFailed(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  errorMessage: string
) {
  const nowIso = new Date().toISOString();
  await supabase
    .from("import_center_jobs")
    .update({
      status: "failed",
      processor_error: errorMessage.slice(0, 4000),
      last_error_message: errorMessage.slice(0, 4000),
      processing_heartbeat_at: nowIso,
      last_activity_at: nowIso,
      runner_completed_at: nowIso,
      completed_at: nowIso,
      runner_lock_token: null,
      runner_lock_expires_at: null
    })
    .eq("id", jobId);
}

function mapContactRowToTargets(row: Record<string, unknown>, mappings: Array<Record<string, unknown>>) {
  const standard: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  const tags: Array<{
    sourceHeader: string;
    rawValue: unknown;
    transform: ReturnType<typeof resolveMappingTransform>;
  }> = [];
  for (const mapping of mappings) {
    const sourceHeader = toText(mapping.sourceHeader);
    const targetType = toText(mapping.targetType);
    const targetKey = toText(mapping.targetKey) || null;
    const raw = row[sourceHeader];
    if (targetType === "unmapped") continue;
    if (targetType === "tags") {
      tags.push({
        sourceHeader,
        rawValue: raw,
        transform: resolveMappingTransform(mapping)
      });
      continue;
    }
    if (!targetKey) continue;
    if (targetType === "standard") {
      standard[targetKey] = raw;
      continue;
    }
    if (targetType === "custom") custom[targetKey] = raw;
  }
  return { standard, custom, tags };
}

function mapTransactionRowToTargets(row: Record<string, unknown>, mappings: Array<Record<string, unknown>>) {
  const transaction: Record<string, unknown> = {};
  const contact: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const mapping of mappings) {
    const sourceHeader = toText(mapping.sourceHeader);
    const targetType = toText(mapping.targetType);
    const targetKey = toText(mapping.targetKey) || null;
    if (targetType === "unmapped" || !targetKey) continue;
    const value = row[sourceHeader];
    if (targetType === "custom") {
      custom[targetKey] = value;
      continue;
    }
    if (targetType !== "standard") continue;
    if (targetKey.startsWith("transaction:")) {
      transaction[targetKey.replace("transaction:", "")] = value;
      continue;
    }
    if (targetKey.startsWith("contact:")) {
      contact[targetKey.replace("contact:", "")] = value;
    }
  }
  return { transaction, contact, custom };
}

function donorStatusForCategory(category: string) {
  if (category === "donor") return "active";
  if (category === "non_lead") return "inactive";
  return "prospect";
}

function normalizeMatchValue(destinationField: string, value: unknown) {
  const raw = toText(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (["email", "alternate_email", "external_source_id"].includes(destinationField)) return lower;
  if (["phone", "mobile_number", "alternate_phone"].includes(destinationField)) return normalizePhone(raw);
  return raw;
}

async function ensureCustomFieldIdMap(input: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  userId: string | null;
  mappings: Array<Record<string, unknown>>;
}) {
  const map = new Map<string, string>();
  const { data: existing } = await input.supabase
    .from("contact_custom_fields")
    .select("id,internal_key")
    .eq("organization_id", input.organizationId)
    .eq("module", "contacts");
  for (const row of existing ?? []) map.set(toText(row.internal_key), toText(row.id));

  const { data: maxRow } = await input.supabase
    .from("contact_custom_fields")
    .select("display_order")
    .eq("organization_id", input.organizationId)
    .eq("module", "contacts")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextDisplayOrder = Number(maxRow?.display_order ?? 0) + 1;

  for (const mapping of input.mappings) {
    if (toText(mapping.targetType) !== "custom") continue;
    const createField = (mapping.createField ?? {}) as Record<string, unknown>;
    const sourceHeader = toText(mapping.sourceHeader);
    const targetKey = toText(mapping.targetKey);
    const internalKey = targetKey || sanitizeInternalKey(toText(createField.label) || sourceHeader);
    if (!internalKey || map.has(internalKey)) continue;
    const label = toText(createField.label) || sourceHeader || internalKey;
    const dataType = toText(createField.dataType) || "text";
    const { data: created, error } = await input.supabase
      .from("contact_custom_fields")
      .insert({
        organization_id: input.organizationId,
        module: "contacts",
        field_label: label,
        internal_key: internalKey,
        data_type: dataType,
        display_order: nextDisplayOrder,
        is_active: true,
        created_by: input.userId
      })
      .select("id")
      .single();
    if (error) throw error;
    map.set(internalKey, toText(created.id));
    nextDisplayOrder += 1;
  }
  return map;
}

async function getExistingCustomFieldValueMap(input: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  contactId: string;
  customFieldIds: string[];
}) {
  const values = new Map<string, string>();
  if (input.customFieldIds.length === 0) return values;
  const { data, error } = await input.supabase
    .from("contact_custom_field_values")
    .select("custom_field_id,value_text")
    .eq("organization_id", input.organizationId)
    .eq("contact_id", input.contactId)
    .in("custom_field_id", input.customFieldIds);
  if (error) throw error;
  for (const row of data ?? []) values.set(toText(row.custom_field_id), toText(row.value_text));
  return values;
}

async function applyMappedCustomValues(input: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  userId: string | null;
  contactId: string;
  mappedCustom: Record<string, unknown>;
  customFieldIdMap: Map<string, string>;
  mode: "overwrite_existing" | "update_blank_only";
}) {
  const customFieldIds = Array.from(input.customFieldIdMap.values());
  const existingMap =
    input.mode === "update_blank_only"
      ? await getExistingCustomFieldValueMap({
          supabase: input.supabase,
          organizationId: input.organizationId,
          contactId: input.contactId,
          customFieldIds
        })
      : new Map<string, string>();

  for (const [internalKey, rawValue] of Object.entries(input.mappedCustom)) {
    const fieldId = input.customFieldIdMap.get(internalKey);
    if (!fieldId) continue;
    const valueText = toText(rawValue);
    if (!valueText) continue;
    if (input.mode === "update_blank_only" && !isBlankImportValue(existingMap.get(fieldId))) continue;
    const { error } = await input.supabase.from("contact_custom_field_values").upsert(
      {
        organization_id: input.organizationId,
        contact_id: input.contactId,
        custom_field_id: fieldId,
        value_text: valueText,
        value_json: { value: valueText },
        created_by: input.userId
      },
      { onConflict: "organization_id,contact_id,custom_field_id" }
    );
    if (error) throw error;
  }
}

async function ensureContactTags(input: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  userId: string | null;
  tagNames: string[];
  cache: Map<string, string>;
  createdTracker: Set<string>;
}) {
  const normalizedNames = Array.from(new Set(input.tagNames.map((name) => toText(name)).filter(Boolean)));
  const tagIds: string[] = [];
  let createdCount = 0;
  for (const name of normalizedNames) {
    const key = name.toLowerCase();
    const cached = input.cache.get(key);
    if (cached) {
      tagIds.push(cached);
      continue;
    }
    const { data: existing, error: existingError } = await input.supabase
      .from("tags")
      .select("id")
      .eq("organization_id", input.organizationId)
      .is("parent_tag_id", null)
      .ilike("name", name)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id) {
      const id = toText(existing.id);
      input.cache.set(key, id);
      tagIds.push(id);
      continue;
    }
    const { data: created, error: createdError } = await input.supabase
      .from("tags")
      .insert({
        organization_id: input.organizationId,
        name,
        slug: name,
        module: "contacts",
        is_active: true,
        created_by: input.userId,
        updated_by: input.userId
      })
      .select("id")
      .single();
    if (createdError) throw createdError;
    const createdId = toText(created.id);
    input.cache.set(key, createdId);
    tagIds.push(createdId);
    if (!input.createdTracker.has(createdId)) {
      input.createdTracker.add(createdId);
      createdCount += 1;
    }
  }
  return { tagIds, createdCount };
}

function buildUpdatedStandardPayload(input: {
  existing: Record<string, unknown>;
  incoming: Record<string, unknown>;
  onMatchBehavior: string;
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

async function findContactMatchesByField(input: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  destinationField: string;
  keyValue: string;
  customFieldCache: Map<string, string | null>;
}) {
  const destinationField = toText(input.destinationField);
  const keyValue = normalizeMatchValue(destinationField, input.keyValue);
  if (!destinationField || !keyValue) return [];
  if (destinationField.startsWith("custom:")) {
    const internalKey = destinationField.replace("custom:", "");
    let fieldId = input.customFieldCache.get(internalKey) ?? null;
    if (!fieldId) {
      const { data: field, error } = await input.supabase
        .from("contact_custom_fields")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("module", "contacts")
        .eq("internal_key", internalKey)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      fieldId = field?.id ? toText(field.id) : null;
      input.customFieldCache.set(internalKey, fieldId);
    }
    if (!fieldId) return [];
    const { data, error } = await input.supabase
      .from("contact_custom_field_values")
      .select("contact_id,value_text")
      .eq("organization_id", input.organizationId)
      .eq("custom_field_id", fieldId)
      .ilike("value_text", keyValue)
      .limit(5);
    if (error) throw error;
    return Array.from(new Set((data ?? []).map((row) => toText(row.contact_id))));
  }

  const exact = await input.supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq(destinationField, keyValue)
    .limit(5);
  if (exact.error) throw exact.error;
  if ((exact.data ?? []).length > 0) return (exact.data ?? []).map((row) => toText(row.id));

  const fuzzy = await input.supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", input.organizationId)
    .ilike(destinationField, keyValue)
    .limit(5);
  if (fuzzy.error) throw fuzzy.error;
  return (fuzzy.data ?? []).map((row) => toText(row.id));
}

async function resolveContactDuplicate(input: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  row: Record<string, unknown>;
  standard: Record<string, unknown>;
  mappings: Array<Record<string, unknown>>;
}) {
  const externalId = toLower(input.standard.external_source_id);
  if (externalId) {
    const exact = await input.supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("external_source", "import_center")
      .eq("external_source_id", externalId)
      .maybeSingle();
    if (exact.error) throw exact.error;
    if (exact.data?.id) return { duplicate: false, existingId: toText(exact.data.id), byExternalId: true };

    const fuzzy = await input.supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("external_source", "import_center")
      .ilike("external_source_id", externalId)
      .maybeSingle();
    if (fuzzy.error) throw fuzzy.error;
    if (fuzzy.data?.id) return { duplicate: false, existingId: toText(fuzzy.data.id), byExternalId: true };
  }

  const emailMapping = input.mappings.find(
    (mapping) => toText(mapping.targetType) === "standard" && toText(mapping.targetKey) === "email"
  );
  if (emailMapping) {
    const email = toLower(input.row[toText(emailMapping.sourceHeader)]);
    if (email) {
      const match = await input.supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", input.organizationId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (match.error) throw match.error;
      if (match.data?.id) return { duplicate: true, existingId: toText(match.data.id), reason: "Duplicate email match" };
    }
  }

  const firstName = toLower(input.standard.first_name);
  const lastName = toLower(input.standard.last_name);
  const phone = normalizePhone(input.standard.phone);
  if (firstName && lastName && phone) {
    const candidates = await input.supabase
      .from("contacts")
      .select("id,phone")
      .eq("organization_id", input.organizationId)
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
      .limit(25);
    if (candidates.error) throw candidates.error;
    const match = (candidates.data ?? []).find((row) => normalizePhone(row.phone) === phone);
    if (match?.id) {
      return { duplicate: true, existingId: toText(match.id), reason: "Duplicate first + last + phone match" };
    }
  }

  return { duplicate: false, existingId: null, byExternalId: false };
}

function normalizeRerunSettings(job: Record<string, unknown>) {
  return {
    enabled: Boolean(job.rerun_matching_enabled),
    sourceMatchColumn: toText(job.source_match_column) || null,
    destinationMatchField: toText(job.destination_match_field) || null,
    onMatchBehavior: toText(job.on_match_behavior) || "update_blank_only",
    onNoMatchBehavior: toText(job.on_no_match_behavior) || "create_new",
    missingKeyBehavior: toText(job.missing_key_behavior) || "skip_row"
  };
}

async function processContactsImport(input: {
  supabase: ReturnType<typeof createClient>;
  job: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  rowOffset?: number;
}) {
  const organizationId = toText(input.job.organization_id);
  const userId = toText(input.job.uploaded_by) || null;
  const snapshot = (input.job.mapping_configuration_snapshot ?? {}) as Record<string, unknown>;
  const mappings = (Array.isArray(snapshot.mappings) ? snapshot.mappings : []) as Array<Record<string, unknown>>;
  const classification = (input.job.classification_snapshot ?? {}) as Record<string, unknown>;
  const contactType = toText(classification.contactType) === "organization" ? "organization" : "person";
  const contactCategory =
    toText(classification.contactCategory) === "donor"
      ? "donor"
      : toText(classification.contactCategory) === "non_lead"
        ? "non_lead"
        : "lead";
  const rerun = normalizeRerunSettings(input.job);
  const duplicateHandling = toText(input.job.duplicate_handling) === "flag" ? "flag" : "skip";
  const tagDelimiter = toText((input.job.tag_configuration ?? {}).delimiter) || ";";

  if (!mappings.length) throw new Error("Import job has no mappings.");
  const required = contactType === "organization" ? "organization_name" : "first_name";
  if (!mappings.some((m) => toText(m.targetType) === "standard" && toText(m.targetKey) === required)) {
    throw new Error("Required contact mapping is missing.");
  }
  if (
    contactType === "person" &&
    !mappings.some((m) => toText(m.targetType) === "standard" && toText(m.targetKey) === "last_name")
  ) {
    throw new Error("Last Name must be mapped for person contact imports.");
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

  const customFieldIdMap = await ensureCustomFieldIdMap({
    supabase: input.supabase,
    organizationId,
    userId,
    mappings
  });
  const tagLookupCache = new Map<string, string | null>();
  const createdTagTracker = new Set<string>();
  const rerunCustomFieldCache = new Map<string, string | null>();

  const rowOffset = toNumber(input.rowOffset, 0);
  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    const rowIndex = rowOffset + index + 1;
    let stage = "row_start";
    const rowTrace: string[] = [];
    const logRow = (message: string) => {
      rowTrace.push(`${new Date().toISOString()} ${message}`);
    };
    logRow(`row_start row=${rowIndex}`);
    try {
      stage = "map_row_to_targets";
      const mapped = mapContactRowToTargets(row, mappings);
      logRow(`map_targets standard_keys=${Object.keys(mapped.standard).length} custom_keys=${Object.keys(mapped.custom).length} tags_mapped=${Array.isArray(mapped.tags) ? mapped.tags.length : 0}`);
      const mappedOrgName = toText(mapped.standard.organization_name);
      let firstName = "";
      let lastName = "";
      let organizationName: string | null = null;

      stage = "resolve_contact_identity";
      if (contactType === "organization") {
        if (!mappedOrgName) {
          skippedRows += 1;
          await appendImportCenterRowError({
            supabase: input.supabase,
            organizationId,
            jobId: toText(input.job.id),
            rowIndex,
            errorMessage: "Organization Name is required when Contact Type is Organization.",
            rawRow: row
          });
          continue;
        }
        firstName = mappedOrgName;
        lastName = "(Organization)";
        organizationName = mappedOrgName;
      } else {
        firstName = toText(mapped.standard.first_name);
        lastName = toText(mapped.standard.last_name);
        organizationName = mappedOrgName || null;
        if (!firstName || !lastName) {
          skippedRows += 1;
          await appendImportCenterRowError({
            supabase: input.supabase,
            organizationId,
            jobId: toText(input.job.id),
            rowIndex,
            errorMessage: "First Name and Last Name are required when Contact Type is Person.",
            rawRow: row
          });
          continue;
        }
      }

      const incomingPayload = {
        organization_id: organizationId,
        first_name: firstName,
        last_name: lastName,
        preferred_name: toText(mapped.standard.preferred_name) || null,
        organization_name: organizationName,
        entity_type: contactType,
        tracking_status: contactCategory,
        donor_status: donorStatusForCategory(contactCategory),
        email: toLower(mapped.standard.email) || null,
        alternate_email: toLower(mapped.standard.alternate_email) || null,
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
        external_source_id: toLower(mapped.standard.external_source_id) || null,
        created_by: userId,
        updated_by: userId
      };
      logRow(`contact_payload_built email=${toText(incomingPayload.email)} first_name=${toText(incomingPayload.first_name)} last_name=${toText(incomingPayload.last_name)}`);

      const relationCacheKey = (value: string, transform: ReturnType<typeof resolveMappingTransform>) => {
        const normalized = transform.relatedRecord.normalizeTrim ? value.trim() : value;
        return `slug:${slugifyTag(normalized)}`;
      };

      const resolveTagIdByValue = async (params: {
        value: string;
        transform: ReturnType<typeof resolveMappingTransform>;
        sourceHeader: string;
        rowIndex: number;
      }) => {
        stage = "tag_lookup";
        const lookupValue = params.transform.relatedRecord.normalizeTrim
          ? params.value.trim()
          : params.value;
        logRow(`tag_lookup_start source=${params.sourceHeader} raw_value=${params.value} normalized=${lookupValue}`);
        if (!lookupValue) return null;
        const lookupSlug = slugifyTag(lookupValue);
        const cacheKey = relationCacheKey(lookupValue, params.transform);
        if (tagLookupCache.has(cacheKey)) {
          logRow(`tag_lookup_cache_hit value=${lookupValue} tag_id=${toText(tagLookupCache.get(cacheKey)) || "null"}`);
          return tagLookupCache.get(cacheKey) ?? null;
        }

        const lookupQuery = input.supabase
          .from("tags")
          .select("id,name,slug")
          .eq("organization_id", organizationId)
          .eq("slug", lookupSlug)
          .limit(1)
          .maybeSingle();
        const { data: existing, error: existingError } = await lookupQuery;
        if (existingError) throw existingError;
        if (existing?.id) {
          const id = toText(existing.id);
          tagLookupCache.set(cacheKey, id);
          logRow(`tag_lookup_reused slug=${lookupSlug} value=${lookupValue} tag_id=${id}`);
          return id;
        }

        let onMissing = params.transform.relatedRecord.onMissing;
        if (params.transform.valueHandlingMode === "relation_lookup_or_create") {
          onMissing = "create";
        }
        if (onMissing === "skip_value") {
          tagLookupCache.set(cacheKey, null);
          logRow(`tag_lookup_missing_skip value=${lookupValue}`);
          return null;
        }
        if (onMissing === "fail_row") {
          throw new Error(
            `Tag "${lookupValue}" from column "${params.sourceHeader}" was not found (row ${params.rowIndex}).`
          );
        }

        const createName = lookupValue.trim();
        const { data: created, error: createdError } = await input.supabase
          .from("tags")
          .insert({
            organization_id: organizationId,
            name: createName,
            slug: lookupSlug,
            module: "contacts",
            is_active: true,
            created_by: userId,
            updated_by: userId
          })
          .select("id")
          .single();
        if (createdError) {
          const { data: recovered, error: recoveredError } = await input.supabase
            .from("tags")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("slug", lookupSlug)
            .maybeSingle();
          if (recoveredError) throw recoveredError;
          if (recovered?.id) {
            const recoveredId = toText(recovered.id);
            tagLookupCache.set(cacheKey, recoveredId);
            logRow(
              isTagSlugConflictError(createdError)
                ? `tag_lookup_recovered_after_conflict slug=${lookupSlug} value=${lookupValue} tag_id=${recoveredId}`
                : `tag_lookup_recovered_after_create_error slug=${lookupSlug} value=${lookupValue} tag_id=${recoveredId} create_error=${formatImportErrorMessage(createdError, "unknown create error")}`
            );
            return recoveredId;
          }
          throw createdError;
        }
        const createdId = toText(created.id);
        tagLookupCache.set(cacheKey, createdId);
        if (!createdTagTracker.has(createdId)) {
          createdTagTracker.add(createdId);
          newTagsCreated += 1;
        }
        logRow(`tag_created slug=${lookupSlug} value=${lookupValue} tag_id=${createdId}`);
        return createdId;
      };

      const applyMappedTags = async (contactId: string) => {
        stage = "apply_tags";
        if (!Array.isArray(mapped.tags) || mapped.tags.length === 0) return;
        let replaceExisting = false;
        const tagIds = new Set<string>();

        for (const mappedTag of mapped.tags) {
          logRow(`groups_raw source=${mappedTag.sourceHeader} value=${toText(mappedTag.rawValue)}`);
          const transform = resolveMappingTransform(
            {
              targetType: "tags",
              targetKey: "tags",
              transform: mappedTag.transform
            },
            tagDelimiter
          );
          if (transform.applyBehavior === "replace") {
            replaceExisting = true;
          }

          const values = tokenizeMappedValue({
            rawValue: mappedTag.rawValue,
            transform,
            fallbackDelimiter: tagDelimiter
          });
          logRow(`groups_split source=${mappedTag.sourceHeader} values=${JSON.stringify(values)}`);
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
          stage = "replace_contact_tags";
          const { error: deleteError } = await input.supabase
            .from("contact_tags")
            .delete()
            .eq("organization_id", organizationId)
            .eq("contact_id", contactId);
          if (deleteError) throw deleteError;
          logRow(`contact_tags_replaced contact_id=${contactId}`);
        }

        if (tagIds.size === 0) return;
        stage = "link_contact_tags";
        const tagRows = Array.from(tagIds).map((tagId) => ({
          organization_id: organizationId,
          contact_id: contactId,
          tag_id: tagId,
          assigned_by: userId,
          assignment_source: "import"
        }));
        const { error } = await input.supabase.from("contact_tags").upsert(tagRows, {
          onConflict: "organization_id,contact_id,tag_id",
          ignoreDuplicates: true
        });
        if (error) throw error;
        logRow(`contact_tag_link_success contact_id=${contactId} linked_tags=${tagIds.size}`);
      };

      let matchedContactId: string | null = null;
      stage = "rerun_matching";
      if (rerun.enabled) {
        const sourceColumn = toText(rerun.sourceMatchColumn);
        const destinationField = toText(rerun.destinationMatchField);
        const keyValue = normalizeMatchValue(destinationField, row[sourceColumn]);
        if (!keyValue) {
          if (rerun.missingKeyBehavior === "skip_row") {
            skippedRows += 1;
            missingKeySkipCount += 1;
            await appendImportCenterRowError({
              supabase: input.supabase,
              organizationId,
              jobId: toText(input.job.id),
              rowIndex,
              errorMessage: `Re-import key is blank in source column "${sourceColumn}".`,
              rawRow: row
            });
            continue;
          }
        } else {
          const matches = await findContactMatchesByField({
            supabase: input.supabase,
            organizationId,
            destinationField,
            keyValue,
            customFieldCache: rerunCustomFieldCache
          });
          if (matches.length > 1) {
            failedRows += 1;
            ambiguousMatchCount += 1;
            await appendImportCenterRowError({
              supabase: input.supabase,
              organizationId,
              jobId: toText(input.job.id),
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
        stage = "contact_update_existing";
        if (rerun.onMatchBehavior === "skip_existing") {
          skippedRows += 1;
          skippedExistingCount += 1;
          continue;
        }
        const { data: existing, error: existingError } = await input.supabase
          .from("contacts")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("id", matchedContactId)
          .single();
        if (existingError) throw existingError;
        const updates = buildUpdatedStandardPayload({
          existing: (existing ?? {}) as Record<string, unknown>,
          incoming: incomingPayload,
          onMatchBehavior: rerun.onMatchBehavior
        });
        if (Object.keys(updates).length > 0) {
          updates.updated_by = userId;
          const { error } = await input.supabase
            .from("contacts")
            .update(updates)
            .eq("organization_id", organizationId)
            .eq("id", matchedContactId);
          if (error) throw error;
        }
        await applyMappedCustomValues({
          supabase: input.supabase,
          organizationId,
          userId,
          contactId: matchedContactId,
          mappedCustom: mapped.custom,
          customFieldIdMap,
          mode: rerun.onMatchBehavior === "update_blank_only" ? "update_blank_only" : "overwrite_existing"
        });
        await applyMappedTags(matchedContactId);
        logRow(`contact_upsert_success mode=update contact_id=${matchedContactId}`);
        if (rerun.onMatchBehavior === "overwrite_existing") overwrittenRecordCount += 1;
        if (rerun.onMatchBehavior === "update_blank_only") blankOnlyUpdateCount += 1;
        successfulRows += 1;
        continue;
      }

      if (rerun.enabled && rerun.onNoMatchBehavior === "skip_row") {
        skippedRows += 1;
        await appendImportCenterRowError({
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
          rowIndex,
          errorMessage: "No existing CRM match was found for this re-import key.",
          rawRow: row
        });
        continue;
      }

      stage = "duplicate_resolution";
      const duplicate = await resolveContactDuplicate({
        supabase: input.supabase,
        organizationId,
        row,
        standard: mapped.standard,
        mappings
      });
      if (duplicate.duplicate) {
        skippedRows += 1;
        await appendImportCenterRowError({
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
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
        stage = "contact_update_by_external_source_id";
        const { data: existing, error: existingError } = await input.supabase
          .from("contacts")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("id", contactId)
          .single();
        if (existingError) throw existingError;
        const updates = buildUpdatedStandardPayload({
          existing: (existing ?? {}) as Record<string, unknown>,
          incoming: incomingPayload,
          onMatchBehavior: "overwrite_existing"
        });
        if (Object.keys(updates).length > 0) {
          updates.updated_by = userId;
          const { error } = await input.supabase
            .from("contacts")
            .update(updates)
            .eq("organization_id", organizationId)
            .eq("id", contactId);
          if (error) throw error;
        }
        await applyMappedCustomValues({
          supabase: input.supabase,
          organizationId,
          userId,
          contactId,
          mappedCustom: mapped.custom,
          customFieldIdMap,
          mode: "overwrite_existing"
        });
        await applyMappedTags(contactId);
        logRow(`contact_upsert_success mode=external_id_update contact_id=${contactId}`);
        overwrittenRecordCount += 1;
        matchedRecordCount += 1;
        successfulRows += 1;
        continue;
      }

      stage = "contact_insert";
      const { data: created, error: insertError } = await input.supabase
        .from("contacts")
        .insert(incomingPayload)
        .select("id")
        .single();
      if (insertError) throw insertError;
      contactId = toText(created.id);
      logRow(`contact_insert_success contact_id=${contactId}`);
      await applyMappedCustomValues({
        supabase: input.supabase,
        organizationId,
        userId,
        contactId,
        mappedCustom: mapped.custom,
        customFieldIdMap,
        mode: "overwrite_existing"
      });
      await applyMappedTags(contactId);
      logRow(`contact_upsert_success mode=create contact_id=${contactId}`);
      newRecordCount += 1;
      successfulRows += 1;
    } catch (error) {
      failedRows += 1;
      const finalMessage = formatImportErrorMessage(
        error,
        "Unexpected error while importing contact row."
      );
      const stackSnippet =
        error instanceof Error && error.stack
          ? error.stack
              .split("\n")
              .slice(0, 6)
              .map((entry) => entry.trim())
              .join(" <- ")
          : "";
      const traceText = rowTrace.join(" || ");
      const enrichedMessage = [
        `stage=${stage}`,
        finalMessage,
        stackSnippet ? `stack=${stackSnippet}` : "",
        traceText ? `trace=${traceText}` : ""
      ]
        .filter(Boolean)
        .join(" | ");
      console.error("import_center_contact_row_failed", {
        jobId: toText(input.job.id),
        rowIndex,
        stage,
        message: finalMessage,
        trace: rowTrace
      });
      await appendImportCenterRowError({
        supabase: input.supabase,
        organizationId,
        jobId: toText(input.job.id),
        rowIndex,
        errorMessage: enrichedMessage,
        rawRow: {
          ...row,
          __processor_stage: stage,
          __processor_trace: rowTrace,
          __processor_error: finalMessage
        }
      });
    }

    if ((index + 1) % 25 === 0) {
      await heartbeat({
        supabase: input.supabase,
        jobId: toText(input.job.id),
        processedRows: rowOffset + index + 1
      });
    }
  }

  return {
    totalRows: input.rows.length,
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
  };
}

function normalizeTransactionConfig(input: Record<string, unknown>) {
  const legacyCreateMissingContact =
    Object.prototype.hasOwnProperty.call(input ?? {}, "createMissingContact")
      ? Boolean((input ?? {}).createMissingContact)
      : true;
  return {
    contactMatchSourceColumn: toText(input.contactMatchSourceColumn) || null,
    contactMatchField: toText(input.contactMatchField) || "email",
    onNoContactMatch:
      toText(input.onNoContactMatch) === "skip_row"
        ? "skip_row"
        : legacyCreateMissingContact
          ? "create_contact"
          : "skip_row",
    newContactType: toText(input.newContactType) === "organization" ? "organization" : "person",
    newContactCategory:
      toText(input.newContactCategory) === "lead" || toText(input.newContactCategory) === "non_lead"
        ? toText(input.newContactCategory)
        : "donor",
    campaignSourceColumn: toText(input.campaignSourceColumn) || null,
    campaignValueMap:
      input.campaignValueMap && typeof input.campaignValueMap === "object"
        ? Object.fromEntries(
            Object.entries(input.campaignValueMap)
              .map(([sourceValue, action]) => [toLower(sourceValue), toText(action)])
              .filter(([key, value]) => Boolean(key) && Boolean(value))
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
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
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
  const text = toLower(value);
  if (!text) return "Cash";
  if (text.includes("check")) return "Check";
  if (
    text.includes("card") ||
    text.includes("credit") ||
    text.includes("debit") ||
    text.includes("visa") ||
    text.includes("master")
  ) return "Card";
  if (text.includes("cash")) return "Cash";
  return null;
}

function parseCampaignAction(action: string) {
  const normalized = toText(action);
  if (normalized.startsWith("campaign:")) {
    return { type: "campaign", campaignId: normalized.replace("campaign:", "").trim() };
  }
  if (normalized.startsWith("create:")) {
    return { type: "create", campaignName: normalized.replace("create:", "").trim() };
  }
  if (normalized) return { type: "campaign", campaignId: normalized };
  return null;
}

async function findTransactionContactMatches(input: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  matchField: string;
  value: string;
}) {
  const matchField = toText(input.matchField);
  if (matchField.startsWith("custom:")) {
    const internalKey = matchField.replace("custom:", "");
    const normalized = toLower(input.value);
    if (!internalKey || !normalized) return [];
    const { data: field, error: fieldError } = await input.supabase
      .from("contact_custom_fields")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("module", "contacts")
      .eq("internal_key", internalKey)
      .eq("is_active", true)
      .maybeSingle();
    if (fieldError) throw fieldError;
    if (!field?.id) return [];
    const { data: valueRows, error: valuesError } = await input.supabase
      .from("contact_custom_field_values")
      .select("contact_id,value_text")
      .eq("organization_id", input.organizationId)
      .eq("custom_field_id", toText(field.id))
      .ilike("value_text", normalized)
      .limit(5);
    if (valuesError) throw valuesError;
    return Array.from(new Set((valueRows ?? []).map((row) => toText(row.contact_id))));
  }
  if (["email", "alternate_email", "external_source_id"].includes(matchField)) {
    const normalized = toLower(input.value);
    if (!normalized) return [];
    const { data, error } = await input.supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .ilike(matchField, normalized)
      .limit(5);
    if (error) throw error;
    return (data ?? []).map((row) => toText(row.id));
  }

  const normalizedPhoneValue = normalizePhone(input.value);
  if (!normalizedPhoneValue) return [];
  const { data, error } = await input.supabase
    .from("contacts")
    .select("id,phone,mobile_number,alternate_phone")
    .eq("organization_id", input.organizationId)
    .or(
      `phone.ilike.%${normalizedPhoneValue}%,mobile_number.ilike.%${normalizedPhoneValue}%,alternate_phone.ilike.%${normalizedPhoneValue}%`
    )
    .limit(50);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => {
      if (matchField === "phone") return normalizePhone(row.phone) === normalizedPhoneValue;
      if (matchField === "mobile_number") return normalizePhone(row.mobile_number) === normalizedPhoneValue;
      return normalizePhone(row.alternate_phone) === normalizedPhoneValue;
    })
    .map((row) => toText(row.id));
}

async function createContactForTransaction(input: {
  supabase: ReturnType<typeof createClient>;
  organizationId: string;
  userId: string | null;
  matchField: string;
  matchValue: string;
  config: Record<string, unknown>;
  mappedContact: Record<string, unknown>;
}) {
  const inferredEmail =
    input.matchField === "email" || input.matchField === "alternate_email" ? toLower(input.matchValue) : "";
  const inferredPhone =
    ["phone", "mobile_number", "alternate_phone"].includes(input.matchField) ? toText(input.matchValue) : "";
  const inferredExternalSourceId = input.matchField === "external_source_id" ? toLower(input.matchValue) : "";

  const configuredOrgName = toText(input.mappedContact.organization_name);
  const configuredFirstName = toText(input.mappedContact.first_name);
  const configuredLastName = toText(input.mappedContact.last_name);
  const newContactType = toText(input.config.newContactType) === "organization" ? "organization" : "person";
  const newContactCategory =
    toText(input.config.newContactCategory) === "lead" || toText(input.config.newContactCategory) === "non_lead"
      ? toText(input.config.newContactCategory)
      : "donor";

  const email = toLower(input.mappedContact.email) || inferredEmail || "";
  const phone = toText(input.mappedContact.phone) || inferredPhone;
  const externalSourceId = toLower(input.mappedContact.external_source_id) || inferredExternalSourceId;
  const organizationName =
    newContactType === "organization"
      ? configuredOrgName || toText(input.matchValue) || "Imported Organization"
      : configuredOrgName || null;
  const firstName =
    newContactType === "organization"
      ? organizationName || "Imported Organization"
      : configuredFirstName ||
        (email.includes("@") ? email.split("@")[0] : "") ||
        toText(input.matchValue) ||
        "Imported";
  const lastName = newContactType === "organization" ? "(Organization)" : configuredLastName || "(Imported)";

  const { data, error } = await input.supabase
    .from("contacts")
    .insert({
      organization_id: input.organizationId,
      first_name: firstName,
      last_name: lastName,
      preferred_name: null,
      organization_name: organizationName,
      entity_type: newContactType,
      tracking_status: newContactCategory,
      donor_status: donorStatusForCategory(newContactCategory),
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
  return toText(data.id);
}

async function processTransactionsImport(input: {
  supabase: ReturnType<typeof createClient>;
  job: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  rowOffset?: number;
}) {
  const organizationId = toText(input.job.organization_id);
  const userId = toText(input.job.uploaded_by) || null;
  const snapshot = (input.job.mapping_configuration_snapshot ?? {}) as Record<string, unknown>;
  const mappings = (Array.isArray(snapshot.mappings) ? snapshot.mappings : []) as Array<Record<string, unknown>>;
  const classSnapshot = (input.job.classification_snapshot ?? {}) as Record<string, unknown>;
  const config = normalizeTransactionConfig(
    ((classSnapshot.transactionConfig ?? classSnapshot) as Record<string, unknown>) ?? {}
  );

  if (!mappings.length) throw new Error("Import job has no mappings.");
  if (
    !mappings.some((m) => toText(m.targetType) === "standard" && toText(m.targetKey) === "transaction:amount")
  ) {
    throw new Error("Donation Amount must be mapped before import.");
  }
  if (
    !mappings.some((m) => toText(m.targetType) === "standard" && toText(m.targetKey) === "transaction:donation_date")
  ) {
    throw new Error("Donation Date must be mapped before import.");
  }
  if (!toText(config.contactMatchSourceColumn)) throw new Error("Contact match source column is required.");
  if (!toText(config.campaignSourceColumn)) throw new Error("Campaign source column is required.");

  const customFieldIdMap = await ensureCustomFieldIdMap({
    supabase: input.supabase,
    organizationId,
    userId,
    mappings
  });

  const campaignById = new Map<string, string>();
  const createdCampaignByName = new Map<string, { id: string; name: string }>();
  const configuredCampaignIds = Array.from(
    new Set(
      Object.values(config.campaignValueMap)
        .map((value) => parseCampaignAction(toText(value)))
        .filter((value) => value?.type === "campaign")
        .map((value) => toText(value.campaignId))
        .filter(Boolean)
    )
  );
  if (configuredCampaignIds.length > 0) {
    const { data } = await input.supabase
      .from("campaigns")
      .select("id,name")
      .eq("organization_id", organizationId)
      .in("id", configuredCampaignIds);
    for (const row of data ?? []) campaignById.set(toText(row.id), toText(row.name));
  }

  const resolveCampaignForValue = async (sourceCampaignValue: string) => {
    const action = parseCampaignAction(config.campaignValueMap[toLower(sourceCampaignValue)]);
    if (!action) return null;
    if (action.type === "campaign") {
      const id = toText(action.campaignId);
      const name = campaignById.get(id);
      if (!id || !name) return null;
      return { id, name };
    }
    const requestedName = toText(action.campaignName) || toText(sourceCampaignValue);
    if (!requestedName) return null;
    const cacheKey = toLower(requestedName);
    const cached = createdCampaignByName.get(cacheKey);
    if (cached) return cached;
    const existing = await input.supabase
      .from("campaigns")
      .select("id,name")
      .eq("organization_id", organizationId)
      .ilike("name", requestedName)
      .limit(1)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) {
      const resolved = { id: toText(existing.data.id), name: toText(existing.data.name) || requestedName };
      campaignById.set(resolved.id, resolved.name);
      createdCampaignByName.set(cacheKey, resolved);
      return resolved;
    }
    const created = await input.supabase
      .from("campaigns")
      .insert({
        organization_id: organizationId,
        name: requestedName,
        status: "Active",
        owner_user_id: userId,
        created_by: userId
      })
      .select("id,name")
      .single();
    if (created.error) throw created.error;
    const resolved = { id: toText(created.data.id), name: toText(created.data.name) || requestedName };
    campaignById.set(resolved.id, resolved.name);
    createdCampaignByName.set(cacheKey, resolved);
    return resolved;
  };

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

  const rowOffset = toNumber(input.rowOffset, 0);
  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    const rowIndex = rowOffset + index + 1;
    try {
      const sourceMatchColumn = toText(config.contactMatchSourceColumn);
      const matchValue = toText(row[sourceMatchColumn]);
      if (!matchValue) {
        skippedRows += 1;
        noContactMatchSkipCount += 1;
        await appendImportCenterRowError({
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
          rowIndex,
          errorMessage: `Contact match key is blank in source column "${sourceMatchColumn}".`,
          rawRow: row
        });
        continue;
      }

      const mapped = mapTransactionRowToTargets(row, mappings);
      let contactId: string | null = null;
      const matches = await findTransactionContactMatches({
        supabase: input.supabase,
        organizationId,
        matchField: toText(config.contactMatchField),
        value: matchValue
      });
      if (matches.length > 1) {
        failedRows += 1;
        ambiguousContactMatchCount += 1;
        await appendImportCenterRowError({
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
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

      if (!contactId) {
        if (toText(config.onNoContactMatch) === "skip_row") {
          skippedRows += 1;
          noContactMatchSkipCount += 1;
          await appendImportCenterRowError({
            supabase: input.supabase,
            organizationId,
            jobId: toText(input.job.id),
            rowIndex,
            errorMessage: `No contact was found for key "${matchValue}" and "Skip Row" is selected for unmatched contacts.`,
            rawRow: row
          });
          continue;
        }
        contactId = await createContactForTransaction({
          supabase: input.supabase,
          organizationId,
          userId,
          matchField: toText(config.contactMatchField),
          matchValue,
          config,
          mappedContact: mapped.contact
        });
        createdContactCount += 1;
      }

      await applyMappedCustomValues({
        supabase: input.supabase,
        organizationId,
        userId,
        contactId,
        mappedCustom: mapped.custom,
        customFieldIdMap,
        mode: "overwrite_existing"
      });

      const rawCampaignValue = toText(row[toText(config.campaignSourceColumn)]);
      if (!rawCampaignValue) {
        skippedRows += 1;
        campaignUnmappedSkipCount += 1;
        await appendImportCenterRowError({
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
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
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
          rowIndex,
          errorMessage: `Campaign "${rawCampaignValue}" was not mapped to an existing campaign and could not be created.`,
          rawRow: row
        });
        continue;
      }
      campaignMappedCount += 1;

      const amount = parseAmount(mapped.transaction.amount);
      if (amount === null) {
        skippedRows += 1;
        await appendImportCenterRowError({
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
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
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
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
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
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
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
          rowIndex,
          errorMessage: "Check Number is required when Payment Type is Check.",
          rawRow: row
        });
        continue;
      }
      if (paymentType === "Card" && !transactionId) {
        skippedRows += 1;
        await appendImportCenterRowError({
          supabase: input.supabase,
          organizationId,
          jobId: toText(input.job.id),
          rowIndex,
          errorMessage: "Transaction ID is required when Payment Type is Card.",
          rawRow: row
        });
        continue;
      }

      const externalTransactionId = toText(mapped.transaction.external_transaction_id);
      const sourcePlatform = toText(mapped.transaction.source_platform) || "import_center_transactions";
      if (externalTransactionId) {
        const duplicate = await input.supabase
          .from("donations")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("source_platform", sourcePlatform)
          .eq("external_transaction_id", externalTransactionId)
          .maybeSingle();
        if (duplicate.error) throw duplicate.error;
        if (duplicate.data?.id) {
          skippedRows += 1;
          await appendImportCenterRowError({
            supabase: input.supabase,
            organizationId,
            jobId: toText(input.job.id),
            rowIndex,
            errorMessage:
              "Duplicate transaction skipped (source_platform + external_transaction_id already exists).",
            rawRow: row
          });
          continue;
        }
      }

      const recurring = ["true", "1", "yes", "y"].includes(toLower(mapped.transaction.is_recurring));
      const { error: insertError } = await input.supabase.from("donations").insert({
        organization_id: organizationId,
        contact_id: contactId,
        campaign_id: resolvedCampaign.id,
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
        is_recurring: recurring,
        campaign: resolvedCampaign.name || null,
        created_by: userId
      });
      if (insertError) throw insertError;

      successfulRows += 1;
      createdTransactionCount += 1;
    } catch (error) {
      failedRows += 1;
      await appendImportCenterRowError({
        supabase: input.supabase,
        organizationId,
        jobId: toText(input.job.id),
        rowIndex,
        errorMessage: formatImportErrorMessage(
          error,
          "Unexpected error while importing transaction row."
        ),
        rawRow: row
      });
    }

    if ((index + 1) % 25 === 0) {
      await heartbeat({
        supabase: input.supabase,
        jobId: toText(input.job.id),
        processedRows: rowOffset + index + 1
      });
    }
  }

  return {
    totalRows: input.rows.length,
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
  };
}

Deno.serve(async (request) => {
  let requestPayload: Record<string, unknown> = {};
  if (request.method !== "POST") return json({ message: "Method not allowed." }, 405);

  try {
    const runnerSecret = toText(Deno.env.get("IMPORT_CENTER_RUNNER_SECRET"));
    if (runnerSecret) {
      const incomingSecret = toText(request.headers.get("x-import-center-runner-secret"));
      if (incomingSecret !== runnerSecret) return json({ message: "Unauthorized runner request." }, 401);
    }

    const supabase = createClient(ensureEnv("SUPABASE_URL"), ensureEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    requestPayload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const jobId = toText(requestPayload.jobId);
    if (!jobId) return json({ message: "jobId is required." }, 400);

    const nowIso = new Date().toISOString();
    const lockToken = crypto.randomUUID();
    const claim = await supabase
      .from("import_center_jobs")
      .update({
        status: "processing",
        processing_heartbeat_at: nowIso,
        last_activity_at: nowIso,
        runner_invoked_at: nowIso,
        runner_lock_token: lockToken,
        runner_lock_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      })
      .eq("id", jobId)
      .in("status", ["queued", "processing"])
      .is("runner_lock_token", null)
      .select("*")
      .maybeSingle();
    if (claim.error) throw new Error(claim.error.message);

    const job = (claim.data ?? null) as Record<string, unknown> | null;
    if (!job) {
      const existing = await supabase
        .from("import_center_jobs")
        .select("id,status")
        .eq("id", jobId)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      return json({
        ok: true,
        skipped: true,
        reason: existing.data ? `Job is already ${toText(existing.data.status)}.` : "Job not found."
      });
    }

    const organizationId = toText(job.organization_id);
    const importFilePath = toText(job.import_file_path);
    if (!organizationId || !importFilePath) {
      throw new Error("Import job is missing required storage metadata.");
    }

    const bucket = toText(job.import_file_bucket) || "import-center-files";
    const fileRes = await supabase.storage.from(bucket).download(importFilePath);
    if (fileRes.error || !fileRes.data) {
      throw new Error(fileRes.error?.message ?? "Unable to download import file from storage.");
    }

    const sourceType = toLower(job.source_file_type);
    const rows =
      sourceType === "xlsx" || sourceType === "xls"
        ? parseWorkbookRows(await fileRes.data.arrayBuffer(), toText(job.source_sheet_name) || null)
        : parseCsvRows(await fileRes.data.text());

    let processedRows = Math.max(
      0,
      toNumber(
        job.processed_rows,
        toNumber(job.successful_rows, 0) + toNumber(job.failed_rows, 0) + toNumber(job.skipped_rows, 0)
      )
    );
    let successfulRows = toNumber(job.successful_rows, 0);
    let failedRows = toNumber(job.failed_rows, 0);
    let skippedRows = toNumber(job.skipped_rows, 0);
    let newTagsCreated = toNumber(job.new_tags_created, 0);
    let matchedRecordCount = toNumber(job.matched_record_count, 0);
    let overwrittenRecordCount = toNumber(job.overwritten_record_count, 0);
    let blankOnlyUpdateCount = toNumber(job.blank_only_update_count, 0);
    let newRecordCount = toNumber(job.new_record_count, 0);
    let skippedExistingCount = toNumber(job.skipped_existing_count, 0);
    let missingKeySkipCount = toNumber(job.missing_key_skip_count, 0);
    let ambiguousMatchCount = toNumber(job.ambiguous_match_count, 0);
    let matchedContactCount = toNumber(job.matched_contact_count, 0);
    let createdContactCount = toNumber(job.created_contact_count, 0);
    let createdTransactionCount = toNumber(job.created_transaction_count, 0);
    let noContactMatchSkipCount = toNumber(job.no_contact_match_skip_count, 0);
    let campaignMappedCount = toNumber(job.campaign_mapped_count, 0);
    let campaignUnmappedSkipCount = toNumber(job.campaign_unmapped_skip_count, 0);
    let ambiguousContactMatchCount = toNumber(job.ambiguous_contact_match_count, 0);
    let processorLog = toText(job.processor_log);

    if (processedRows === 0) {
      await supabase
        .from("import_center_job_errors")
        .delete()
        .eq("organization_id", organizationId)
        .eq("import_center_job_id", toText(job.id));

      const resetNow = new Date().toISOString();
      processorLog = appendLog(processorLog, "Starting async import job processing.");
      await supabase
        .from("import_center_jobs")
        .update({
          total_rows: rows.length,
          processed_rows: 0,
          last_processed_row: 0,
          successful_rows: 0,
          failed_rows: 0,
          skipped_rows: 0,
          new_tags_created: 0,
          matched_record_count: 0,
          overwritten_record_count: 0,
          blank_only_update_count: 0,
          new_record_count: 0,
          skipped_existing_count: 0,
          missing_key_skip_count: 0,
          ambiguous_match_count: 0,
          matched_contact_count: 0,
          created_contact_count: 0,
          created_transaction_count: 0,
          no_contact_match_skip_count: 0,
          campaign_mapped_count: 0,
          campaign_unmapped_skip_count: 0,
          ambiguous_contact_match_count: 0,
          processing_started_at: resetNow,
          processing_heartbeat_at: resetNow,
          last_activity_at: resetNow,
          completed_at: null,
          runner_completed_at: null,
          processor_error: null,
          last_error_message: null,
          processor_log: processorLog
        })
        .eq("id", toText(job.id));
      successfulRows = 0;
      failedRows = 0;
      skippedRows = 0;
      newTagsCreated = 0;
      matchedRecordCount = 0;
      overwrittenRecordCount = 0;
      blankOnlyUpdateCount = 0;
      newRecordCount = 0;
      skippedExistingCount = 0;
      missingKeySkipCount = 0;
      ambiguousMatchCount = 0;
      matchedContactCount = 0;
      createdContactCount = 0;
      createdTransactionCount = 0;
      noContactMatchSkipCount = 0;
      campaignMappedCount = 0;
      campaignUnmappedSkipCount = 0;
      ambiguousContactMatchCount = 0;
    }

    const batchSize = getBatchSize();
    const startIndex = Math.max(0, Math.min(processedRows, rows.length));
    const batchRows = rows.slice(startIndex, startIndex + batchSize);

    let chunkResult: Record<string, unknown> = {
      totalRows: batchRows.length,
      successfulRows: 0,
      failedRows: 0,
      skippedRows: 0
    };
    if (batchRows.length > 0) {
      chunkResult =
        toText(job.import_type) === "transactions"
          ? await processTransactionsImport({ supabase, job, rows: batchRows, rowOffset: startIndex })
          : await processContactsImport({ supabase, job, rows: batchRows, rowOffset: startIndex });
    }

    const nextProcessedRows = startIndex + batchRows.length;
    successfulRows += toNumber(chunkResult.successfulRows, 0);
    failedRows += toNumber(chunkResult.failedRows, 0);
    skippedRows += toNumber(chunkResult.skippedRows, 0);
    if (toText(job.import_type) === "transactions") {
      matchedContactCount += toNumber(chunkResult.matchedContactCount, 0);
      createdContactCount += toNumber(chunkResult.createdContactCount, 0);
      createdTransactionCount += toNumber(chunkResult.createdTransactionCount, 0);
      noContactMatchSkipCount += toNumber(chunkResult.noContactMatchSkipCount, 0);
      campaignMappedCount += toNumber(chunkResult.campaignMappedCount, 0);
      campaignUnmappedSkipCount += toNumber(chunkResult.campaignUnmappedSkipCount, 0);
      ambiguousContactMatchCount += toNumber(chunkResult.ambiguousContactMatchCount, 0);
    } else {
      newTagsCreated += toNumber(chunkResult.newTagsCreated, 0);
      matchedRecordCount += toNumber(chunkResult.matchedRecordCount, 0);
      overwrittenRecordCount += toNumber(chunkResult.overwrittenRecordCount, 0);
      blankOnlyUpdateCount += toNumber(chunkResult.blankOnlyUpdateCount, 0);
      newRecordCount += toNumber(chunkResult.newRecordCount, 0);
      skippedExistingCount += toNumber(chunkResult.skippedExistingCount, 0);
      missingKeySkipCount += toNumber(chunkResult.missingKeySkipCount, 0);
      ambiguousMatchCount += toNumber(chunkResult.ambiguousMatchCount, 0);
    }

    const stopCheck = await supabase
      .from("import_center_jobs")
      .select("stop_requested")
      .eq("id", jobId)
      .maybeSingle();
    if (stopCheck.error) throw new Error(stopCheck.error.message);
    const stopRequested = Boolean(stopCheck.data?.stop_requested);

    const done = nextProcessedRows >= rows.length || batchRows.length === 0;
    const status = stopRequested
      ? "cancelled"
      : done
        ? failedRows > 0
          ? "completed_with_errors"
          : "completed"
        : "processing";

    const updateNow = new Date().toISOString();
    processorLog = appendLog(
      processorLog,
      `Processed batch rows ${startIndex + 1}-${nextProcessedRows} of ${rows.length}.`
    );
    const updates: Record<string, unknown> = {
      status,
      total_rows: rows.length,
      processed_rows: nextProcessedRows,
      last_processed_row: nextProcessedRows,
      successful_rows: successfulRows,
      failed_rows: failedRows,
      skipped_rows: skippedRows,
      error_log_location:
        failedRows + skippedRows > 0 ? `import_center_job_errors:${toText(job.id)}` : null,
      processing_heartbeat_at: updateNow,
      last_activity_at: updateNow,
      new_tags_created: newTagsCreated,
      matched_record_count: matchedRecordCount,
      overwritten_record_count: overwrittenRecordCount,
      blank_only_update_count: blankOnlyUpdateCount,
      new_record_count: newRecordCount,
      skipped_existing_count: skippedExistingCount,
      missing_key_skip_count: missingKeySkipCount,
      ambiguous_match_count: ambiguousMatchCount,
      matched_contact_count: matchedContactCount,
      created_contact_count: createdContactCount,
      created_transaction_count: createdTransactionCount,
      no_contact_match_skip_count: noContactMatchSkipCount,
      campaign_mapped_count: campaignMappedCount,
      campaign_unmapped_skip_count: campaignUnmappedSkipCount,
      ambiguous_contact_match_count: ambiguousContactMatchCount,
      last_error_message:
        failedRows > 0 ? `${failedRows} row(s) failed. Download failure report for details.` : null,
      processor_error:
        failedRows > 0 ? `${failedRows} row(s) failed. Download failure report for details.` : null,
      runner_lock_token: null,
      runner_lock_expires_at: null,
      processor_log: processorLog
    };

    if (status === "cancelled" || status === "completed" || status === "completed_with_errors") {
      updates.runner_completed_at = updateNow;
      updates.completed_at = updateNow;
      if (status === "cancelled") {
        updates.stopped_at = updateNow;
        updates.last_error_message = "Stopped by user request.";
        updates.processor_error = "Stopped by user request.";
        processorLog = appendLog(processorLog, "Import stopped by user request.");
        updates.processor_log = processorLog;
      }
    } else {
      updates.runner_completed_at = null;
      updates.completed_at = null;
    }

    const { error: updateError } = await supabase
      .from("import_center_jobs")
      .update(updates)
      .eq("id", toText(job.id));
    if (updateError) throw updateError;

    if (status === "processing") {
      const supabaseUrl = ensureEnv("SUPABASE_URL");
      const serviceRoleKey = ensureEnv("SUPABASE_SERVICE_ROLE_KEY");
      const runnerSecret = toText(Deno.env.get("IMPORT_CENTER_RUNNER_SECRET"));
      const scheduleTimeoutMs = getScheduleTimeoutMs();
      const scheduleRetries = getScheduleRetries();
      const scheduleErrors: string[] = [];
      let scheduled = false;

      for (let attempt = 1; attempt <= scheduleRetries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), scheduleTimeoutMs);
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/import-center-runner`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
              ...(runnerSecret ? { "x-import-center-runner-secret": runnerSecret } : {})
            },
            body: JSON.stringify({ jobId: toText(job.id) }),
            signal: controller.signal
          });
          if (!response.ok) {
            const bodyText = (await response.text().catch(() => "")).slice(0, 280);
            throw new Error(
              `Scheduler response ${response.status} ${response.statusText}${bodyText ? ` | ${bodyText}` : ""}`
            );
          }
          scheduled = true;
          break;
        } catch (scheduleError) {
          scheduleErrors.push(`attempt ${attempt}: ${formatImportErrorMessage(scheduleError, "schedule failed")}`);
          if (attempt < scheduleRetries) {
            await sleep(400 * 2 ** (attempt - 1));
          }
        } finally {
          clearTimeout(timer);
        }
      }

      if (!scheduled) {
        throw new Error(
          `Unable to schedule next import batch after ${scheduleRetries} attempts. ${scheduleErrors.join(" || ")}`
        );
      }
    } else {
      await supabase.from("audit_log").insert({
        organization_id: organizationId,
        actor_user_id: toText(job.uploaded_by) || null,
        action_type:
          toText(job.import_type) === "transactions"
            ? "import_center_transactions_run"
            : "import_center_contacts_run",
        target_entity_type: "import_center_jobs",
        target_entity_id: toText(job.id),
        metadata: {
          status,
          totalRows: rows.length,
          processedRows: nextProcessedRows,
          successfulRows,
          failedRows,
          skippedRows
        }
      });
    }

    return json({
      ok: true,
      jobId: toText(job.id),
      status,
      totalRows: rows.length,
      processedRows: nextProcessedRows,
      batchSize
    });
  } catch (error) {
    const message = formatImportErrorMessage(error, "Unknown import runner failure.");
    const jobId = toText(requestPayload.jobId);
    try {
      if (jobId) {
        const supabase = createClient(ensureEnv("SUPABASE_URL"), ensureEnv("SUPABASE_SERVICE_ROLE_KEY"), {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        await markJobFailed(supabase, jobId, message);
      }
    } catch {
      // ignore secondary failure
    }
    return json({ message }, 500);
  }
});
