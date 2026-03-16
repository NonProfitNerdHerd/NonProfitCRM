import { requireStaffPermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type ContactRecord = Record<string, unknown> & {
  id: string;
  organization_id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  organization_name: string | null;
  email: string | null;
  alternate_email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  mobile_number: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  mailing_address_line_1: string | null;
  mailing_address_line_2: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_postal_code: string | null;
  formal_letter_name: string | null;
  communication_preferences: unknown;
  tags: string[] | null;
  webconnex_id: string | null;
  external_source: string | null;
  external_source_id: string | null;
  is_merged: boolean;
  merged_into_contact_id: string | null;
};

type RelatedSummary = {
  notesCount: number;
  tasksCount: number;
  donationsCount: number;
  tags: Array<{ id: string; path: string; name: string }>;
  externalIds: Array<{ sourceSystem: string; externalId: string; externalType: string | null }>;
};

const CONTACT_SELECT = [
  "id",
  "organization_id",
  "first_name",
  "last_name",
  "preferred_name",
  "organization_name",
  "email",
  "alternate_email",
  "phone",
  "alternate_phone",
  "mobile_number",
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "postal_code",
  "mailing_address_line_1",
  "mailing_address_line_2",
  "mailing_city",
  "mailing_state",
  "mailing_postal_code",
  "formal_letter_name",
  "communication_preferences",
  "tags",
  "webconnex_id",
  "external_source",
  "external_source_id",
  "is_merged",
  "merged_into_contact_id"
].join(",");

const RESOLVABLE_FIELDS = [
  "first_name",
  "last_name",
  "preferred_name",
  "organization_name",
  "email",
  "alternate_email",
  "phone",
  "alternate_phone",
  "mobile_number",
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "postal_code",
  "mailing_address_line_1",
  "mailing_address_line_2",
  "mailing_city",
  "mailing_state",
  "mailing_postal_code",
  "formal_letter_name",
  "communication_preferences"
] as const;

type ResolvableField = (typeof RESOLVABLE_FIELDS)[number];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return text(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  return text(value).replace(/[^0-9]/g, "");
}

function normalizeToken(value: unknown) {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeAddress(value: unknown) {
  return normalizeToken(value).replace(/[^a-z0-9]/g, " ");
}

function isFilled(value: unknown) {
  return text(value).length > 0;
}

function fullName(contact: ContactRecord) {
  return `${text(contact.first_name)} ${text(contact.last_name)}`.trim();
}

function safeArray(input: unknown) {
  return Array.isArray(input) ? input : [];
}

function mergeCommunicationPreferences(master: ContactRecord, duplicate: ContactRecord) {
  const values = new Set<string>();
  for (const entry of safeArray(master.communication_preferences)) {
    const key = text(entry);
    if (key) values.add(key);
  }
  for (const entry of safeArray(duplicate.communication_preferences)) {
    const key = text(entry);
    if (key) values.add(key);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function scorePotentialDuplicate(
  base: ContactRecord,
  candidate: ContactRecord
): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  const baseEmail = normalizeEmail(base.email);
  const candidateEmail = normalizeEmail(candidate.email);
  if (baseEmail && candidateEmail && baseEmail === candidateEmail) {
    score += 70;
    reasons.push("Exact email match");
  }

  const basePhone = normalizePhone(base.phone || base.mobile_number || base.alternate_phone);
  const candidatePhone = normalizePhone(
    candidate.phone || candidate.mobile_number || candidate.alternate_phone
  );
  if (basePhone && candidatePhone && basePhone === candidatePhone) {
    score += 60;
    reasons.push("Exact phone match");
  }

  const baseName = normalizeToken(fullName(base));
  const candidateName = normalizeToken(fullName(candidate));
  if (baseName && candidateName && baseName === candidateName) {
    score += 35;
    reasons.push("Exact full name match");
  }

  const baseAddress = normalizeAddress(base.address_line_1);
  const candidateAddress = normalizeAddress(candidate.address_line_1);
  if (baseAddress && candidateAddress && baseAddress === candidateAddress) {
    score += 20;
    reasons.push("Same primary address");
  }

  const baseCityState = `${normalizeToken(base.city)}|${normalizeToken(base.state)}`;
  const candidateCityState = `${normalizeToken(candidate.city)}|${normalizeToken(candidate.state)}`;
  if (
    normalizeToken(base.first_name) === normalizeToken(candidate.first_name) &&
    normalizeToken(base.last_name) === normalizeToken(candidate.last_name) &&
    baseCityState === candidateCityState &&
    normalizeToken(base.city) &&
    normalizeToken(base.state)
  ) {
    score += 30;
    reasons.push("Same name and city/state");
  }

  if (score >= 40 && normalizeToken(base.last_name) === normalizeToken(candidate.last_name)) {
    score += 5;
  }

  return { score, reasons };
}

function chooseResolvedField(
  key: ResolvableField,
  master: ContactRecord,
  duplicate: ContactRecord
): unknown {
  if (key === "communication_preferences") {
    return mergeCommunicationPreferences(master, duplicate);
  }
  const masterValue = master[key];
  const duplicateValue = duplicate[key];
  if (isFilled(masterValue)) return masterValue;
  if (isFilled(duplicateValue)) return duplicateValue;
  return null;
}

function buildSuggestedResolution(master: ContactRecord, duplicate: ContactRecord) {
  const resolved: Record<string, unknown> = {};
  for (const key of RESOLVABLE_FIELDS) {
    resolved[key] = chooseResolvedField(key, master, duplicate);
  }

  const masterEmail = normalizeEmail(master.email);
  const duplicateEmail = normalizeEmail(duplicate.email);
  if (masterEmail && duplicateEmail && masterEmail !== duplicateEmail && !isFilled(resolved.alternate_email)) {
    resolved.alternate_email = duplicate.email;
  }

  const masterPhone = normalizePhone(master.phone);
  const duplicatePhone = normalizePhone(duplicate.phone);
  if (masterPhone && duplicatePhone && masterPhone !== duplicatePhone && !isFilled(resolved.alternate_phone)) {
    resolved.alternate_phone = duplicate.phone;
  }

  return resolved;
}

function buildConflictList(master: ContactRecord, duplicate: ContactRecord) {
  const conflicts: Array<{ field: string; master: string; duplicate: string }> = [];
  for (const key of RESOLVABLE_FIELDS) {
    if (key === "communication_preferences") continue;
    const left = text(master[key]);
    const right = text(duplicate[key]);
    if (!left || !right) continue;
    if (normalizeToken(left) === normalizeToken(right)) continue;
    conflicts.push({ field: key, master: left, duplicate: right });
  }
  return conflicts;
}

function isMergeSchemaMissingError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return (
    message.includes("contact_external_ids") ||
    message.includes("contact_merge_history") ||
    message.includes("execute_contact_merge") ||
    message.includes("can_merge_contacts") ||
    message.includes("is_merged")
  );
}

async function getContactById(
  organizationId: string,
  contactId: string
): Promise<ContactRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw error;
  return (data as ContactRecord | null) ?? null;
}

async function getRelatedSummary(
  organizationId: string,
  contactId: string
): Promise<RelatedSummary> {
  const supabase = await createClient();
  const [
    notesCount,
    tasksCount,
    donationsCount,
    tagsResult,
    extIdsResult,
    refsResult
  ] = await Promise.all([
    supabase
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId),
    supabase
      .from("donations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId),
    supabase
      .from("contact_tags")
      .select("tag_id,tags(id,name,path)")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId),
    supabase
      .from("contact_external_ids")
      .select("source_system,external_id,external_type")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("is_active", true),
    supabase
      .from("contact_external_references")
      .select("source_system,external_record_id,external_record_type")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
  ]);

  if (notesCount.error) throw notesCount.error;
  if (tasksCount.error) throw tasksCount.error;
  if (donationsCount.error) throw donationsCount.error;
  if (tagsResult.error) throw tagsResult.error;
  if (extIdsResult.error) throw extIdsResult.error;
  if (refsResult.error) throw refsResult.error;

  const tags = (tagsResult.data ?? [])
    .map((row) => {
      const tagData = Array.isArray(row.tags) ? row.tags[0] : row.tags;
      const tag = tagData as Record<string, unknown> | null;
      return {
        id: text(tag?.id),
        path: text(tag?.path),
        name: text(tag?.name)
      };
    })
    .filter((tag) => tag.id)
    .sort((a, b) => a.path.localeCompare(b.path));

  const externalMap = new Map<string, { sourceSystem: string; externalId: string; externalType: string | null }>();
  for (const row of extIdsResult.data ?? []) {
    const sourceSystem = text(row.source_system).toLowerCase();
    const externalId = text(row.external_id).toLowerCase();
    if (!sourceSystem || !externalId) continue;
    externalMap.set(`${sourceSystem}::${externalId}`, {
      sourceSystem,
      externalId,
      externalType: text(row.external_type) || null
    });
  }
  for (const row of refsResult.data ?? []) {
    const sourceSystem = text(row.source_system).toLowerCase();
    const externalId = text(row.external_record_id).toLowerCase();
    if (!sourceSystem || !externalId) continue;
    const key = `${sourceSystem}::${externalId}`;
    if (externalMap.has(key)) continue;
    externalMap.set(key, {
      sourceSystem,
      externalId,
      externalType: text(row.external_record_type) || "reference"
    });
  }

  return {
    notesCount: notesCount.count ?? 0,
    tasksCount: tasksCount.count ?? 0,
    donationsCount: donationsCount.count ?? 0,
    tags,
    externalIds: Array.from(externalMap.values()).sort((a, b) =>
      `${a.sourceSystem}:${a.externalId}`.localeCompare(`${b.sourceSystem}:${b.externalId}`)
    )
  };
}

export async function listMergeSearchContacts(input: { q: string; limit?: number }) {
  await requireStaffPermission("can_merge_contacts");
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();
  const q = text(input.q);
  const limit = Math.min(Math.max(Number(input.limit ?? 20), 1), 100);

  let query = supabase
    .from("contacts")
    .select(CONTACT_SELECT)
    .eq("organization_id", context.organizationId)
    .eq("is_merged", false)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(
      [
        `first_name.ilike.%${q.replaceAll(",", " ")}%`,
        `last_name.ilike.%${q.replaceAll(",", " ")}%`,
        `email.ilike.%${q.replaceAll(",", " ")}%`,
        `phone.ilike.%${q.replaceAll(",", " ")}%`,
        `organization_name.ilike.%${q.replaceAll(",", " ")}%`
      ].join(",")
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = ((data ?? []) as unknown[]) as ContactRecord[];
  const items = rows.map((record) => {
    return {
      id: record.id,
      fullName: fullName(record),
      organizationName: text(record.organization_name) || null,
      email: text(record.email) || null,
      phone: text(record.phone) || null,
      city: text(record.city) || null,
      state: text(record.state) || null
    };
  });

  return { contacts: items };
}

export async function getDuplicateCandidates(input: {
  contactId?: string;
  q?: string;
  limit?: number;
}) {
  await requireStaffPermission("can_merge_contacts");
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();
  const limit = Math.min(Math.max(Number(input.limit ?? 25), 1), 100);

  if (!text(input.contactId) && !text(input.q)) {
    return { candidates: [], searchContacts: [] };
  }

  if (text(input.contactId)) {
    const base = await getContactById(context.organizationId, text(input.contactId));
    if (!base) {
      return { candidates: [], searchContacts: [] };
    }

    const { data: pool, error } = await supabase
      .from("contacts")
      .select(CONTACT_SELECT)
      .eq("organization_id", context.organizationId)
      .eq("is_merged", false)
      .neq("id", base.id)
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (error) throw error;

    const candidateRows = ((pool ?? []) as unknown[]) as ContactRecord[];
    const ranked = candidateRows
      .map((candidate) => {
        const result = scorePotentialDuplicate(base, candidate);
        return {
          duplicateContact: {
            id: candidate.id,
            fullName: fullName(candidate),
            email: text(candidate.email) || null,
            phone: text(candidate.phone) || null,
            address: [text(candidate.address_line_1), text(candidate.city), text(candidate.state)]
              .filter(Boolean)
              .join(", "),
            organizationName: text(candidate.organization_name) || null
          },
          score: result.score,
          matchReasons: result.reasons
        };
      })
      .filter((entry) => entry.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      sourceContact: {
        id: base.id,
        fullName: fullName(base),
        email: text(base.email) || null,
        phone: text(base.phone) || null,
        address: [text(base.address_line_1), text(base.city), text(base.state)]
          .filter(Boolean)
          .join(", "),
        organizationName: text(base.organization_name) || null
      },
      candidates: ranked,
      searchContacts: []
    };
  }

  const search = await listMergeSearchContacts({ q: text(input.q), limit: 30 });
  return {
    candidates: [],
    searchContacts: search.contacts
  };
}

export async function getContactMergePreview(input: {
  masterContactId: string;
  duplicateContactId: string;
}) {
  await requireStaffPermission("can_merge_contacts");
  const context = await requireStaffPermission("can_view_contacts");
  const masterId = text(input.masterContactId);
  const duplicateId = text(input.duplicateContactId);

  if (!masterId || !duplicateId) {
    throw new Error("masterContactId and duplicateContactId are required.");
  }
  if (masterId === duplicateId) {
    throw new Error("Master and duplicate contacts must be different.");
  }

  const [master, duplicate] = await Promise.all([
    getContactById(context.organizationId, masterId),
    getContactById(context.organizationId, duplicateId)
  ]);
  if (!master || !duplicate) {
    throw new Error("One or both contacts could not be found.");
  }
  if (master.is_merged || duplicate.is_merged) {
    throw new Error("Merged contacts cannot be used as merge candidates.");
  }

  const [masterSummary, duplicateSummary] = await Promise.all([
    getRelatedSummary(context.organizationId, masterId),
    getRelatedSummary(context.organizationId, duplicateId)
  ]);

  const suggestedResolution = buildSuggestedResolution(master, duplicate);
  const conflicts = buildConflictList(master, duplicate);

  return {
    master,
    duplicate,
    suggestedResolution,
    conflicts,
    related: {
      master: masterSummary,
      duplicate: duplicateSummary,
      reassignment: {
        notes: duplicateSummary.notesCount,
        tasks: duplicateSummary.tasksCount,
        donations: duplicateSummary.donationsCount,
        tags: duplicateSummary.tags.length,
        externalIds: duplicateSummary.externalIds.length
      }
    }
  };
}

function sanitizeResolvedFieldMap(input: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const key of RESOLVABLE_FIELDS) {
    if (!(key in input)) continue;
    if (key === "communication_preferences") {
      payload[key] = safeArray(input[key]).map((entry) => text(entry)).filter(Boolean);
      continue;
    }
    const value = text(input[key]);
    payload[key] = value || null;
  }
  return payload;
}

export async function executeContactMerge(input: {
  masterContactId: string;
  duplicateContactId: string;
  resolvedFieldMap: Record<string, unknown>;
  actionSource?: string;
}) {
  const context = await requireStaffPermission("can_merge_contacts");
  const supabase = await createClient();
  const resolvedFieldMap = sanitizeResolvedFieldMap(input.resolvedFieldMap ?? {});

  const { data, error } = await supabase.rpc("execute_contact_merge", {
    org_id: context.organizationId,
    master_contact_id: text(input.masterContactId),
    duplicate_contact_id: text(input.duplicateContactId),
    resolved_field_map: resolvedFieldMap,
    action_source: text(input.actionSource) || "manual_ui"
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function getContactMergeHistory(input: {
  contactId?: string;
  limit?: number;
  offset?: number;
}) {
  await requireStaffPermission("can_merge_contacts");
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();
  const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 200);
  const offset = Math.max(Number(input.offset ?? 0), 0);

  let query = supabase
    .from("contact_merge_history")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("merged_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const contactId = text(input.contactId);
  if (contactId) {
    query = query.or(`master_contact_id.eq.${contactId},duplicate_contact_id.eq.${contactId}`);
  }

  const { data, error } = await query;
  if (error) {
    if (isMergeSchemaMissingError(error)) {
      return {
        items: [],
        schemaWarning:
          "Contact merge schema is not available in this environment yet. Run Supabase migration 202603171300 and retry."
      };
    }
    throw error;
  }
  return { items: data ?? [], schemaWarning: null };
}

export function isContactMergeSchemaMissingError(error: unknown) {
  return isMergeSchemaMissingError(error);
}
