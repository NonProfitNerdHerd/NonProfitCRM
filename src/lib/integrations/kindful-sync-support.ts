import { createIntegrationClient } from "@/lib/integrations/db";
import {
  normalizeEmail,
  normalizePhone,
  normalizeToken,
  readString,
  valueByPath
} from "@/lib/integrations/kindful-mapper";

type IntegrationClient = Awaited<ReturnType<typeof createIntegrationClient>>;

export function isKindfulSchemaMissingError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return (
    message.includes("integration_sync_checkpoints") ||
    message.includes("integration_review_queue") ||
    message.includes("integration_dead_letter_queue") ||
    message.includes("raw_source_payloads") ||
    message.includes("transaction_external_ids") ||
    message.includes("campaign_external_ids") ||
    message.includes("tag_external_ids")
  );
}

export function isExternalIdSchemaMissingError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return (
    message.includes("contact_external_ids") ||
    message.includes("resolve_contact_by_external_id") ||
    message.includes("resolve_transaction_by_external_id") ||
    message.includes("transaction_external_ids")
  );
}

export async function upsertCheckpoint(input: {
  supabase: IntegrationClient;
  organizationId: string;
  connectionId: string;
  scope: string;
  checkpointKey: string;
  checkpointValue: Record<string, unknown>;
  lastSuccessfulSyncDate?: string | null;
}) {
  const now = new Date().toISOString();
  const payload = {
    organization_id: input.organizationId,
    integration_connection_id: input.connectionId,
    scope: input.scope,
    checkpoint_key: input.checkpointKey,
    checkpoint_value: input.checkpointValue,
    last_successful_sync_date: input.lastSuccessfulSyncDate ?? now
  };
  const result = await input.supabase
    .from("integration_sync_checkpoints")
    .upsert(payload, {
      onConflict: "organization_id,integration_connection_id,scope,checkpoint_key"
    });
  if (result.error && !isKindfulSchemaMissingError(result.error)) throw result.error;
}

export async function archiveRawPayload(input: {
  supabase: IntegrationClient;
  organizationId: string;
  connectionId: string;
  syncJobId: string;
  sourceSystem: string;
  entityType: string;
  sourceRecordId: string | null;
  payload: Record<string, unknown>;
  payloadHash: string;
}) {
  const result = await input.supabase.from("raw_source_payloads").insert({
    organization_id: input.organizationId,
    integration_connection_id: input.connectionId,
    sync_job_id: input.syncJobId,
    source_system: input.sourceSystem,
    entity_type: input.entityType,
    source_record_id: input.sourceRecordId,
    payload_hash: input.payloadHash,
    payload_json: input.payload
  });
  if (result.error && !isKindfulSchemaMissingError(result.error)) throw result.error;
}

export async function enqueueReview(input: {
  supabase: IntegrationClient;
  organizationId: string;
  connectionId: string;
  syncJobId: string;
  entityType: string;
  sourceRecordId: string | null;
  reason: string;
  confidenceScore?: number | null;
  sourcePayload: Record<string, unknown>;
  candidateMatches: Array<Record<string, unknown>>;
}) {
  const result = await input.supabase.from("integration_review_queue").insert({
    organization_id: input.organizationId,
    integration_connection_id: input.connectionId,
    sync_job_id: input.syncJobId,
    entity_type: input.entityType,
    source_record_id: input.sourceRecordId,
    reason: input.reason,
    confidence_score: input.confidenceScore ?? null,
    source_payload: input.sourcePayload,
    candidate_matches: input.candidateMatches,
    resolution_status: "open"
  });
  if (result.error && !isKindfulSchemaMissingError(result.error)) throw result.error;
}

export async function enqueueDeadLetter(input: {
  supabase: IntegrationClient;
  organizationId: string;
  connectionId: string;
  syncJobId: string;
  entityType: string;
  sourceRecordId: string | null;
  payload: Record<string, unknown>;
  errorMessage: string;
  retryable?: boolean;
}) {
  const result = await input.supabase.from("integration_dead_letter_queue").insert({
    organization_id: input.organizationId,
    integration_connection_id: input.connectionId,
    sync_job_id: input.syncJobId,
    entity_type: input.entityType,
    source_record_id: input.sourceRecordId,
    payload_json: input.payload,
    error_message: input.errorMessage,
    retryable: input.retryable ?? true
  });
  if (result.error && !isKindfulSchemaMissingError(result.error)) throw result.error;
}

type ContactCandidate = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  address_line_1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
};

function scoreContactCandidate(input: {
  source: Record<string, unknown>;
  candidate: ContactCandidate;
}) {
  const sourceEmail = normalizeEmail(readString(input.source, ["email", "primary_email"]));
  const sourcePhone = normalizePhone(
    readString(input.source, ["phone", "mobile_phone", "phone_number", "primary_phone"])
  );
  const sourceFirst = normalizeToken(readString(input.source, ["first_name", "firstName"]));
  const sourceLast = normalizeToken(readString(input.source, ["last_name", "lastName"]));
  const sourceAddress = normalizeToken(
    readString(input.source, ["address_line_1", "address.street", "address.line1", "address1"])
  );
  const sourceCity = normalizeToken(readString(input.source, ["city", "address.city"]));
  const sourceState = normalizeToken(readString(input.source, ["state", "address.state"]));
  const sourcePostal = normalizeToken(readString(input.source, ["postal_code", "zip", "address.postal_code"]));

  const candidateEmail = normalizeEmail(String(input.candidate.email ?? ""));
  const candidatePhone = normalizePhone(
    `${String(input.candidate.phone ?? "")} ${String(input.candidate.alternate_phone ?? "")}`
  );
  const candidateFirst = normalizeToken(String(input.candidate.first_name ?? ""));
  const candidateLast = normalizeToken(String(input.candidate.last_name ?? ""));
  const candidateAddress = normalizeToken(String(input.candidate.address_line_1 ?? ""));
  const candidateCity = normalizeToken(String(input.candidate.city ?? ""));
  const candidateState = normalizeToken(String(input.candidate.state ?? ""));
  const candidatePostal = normalizeToken(String(input.candidate.postal_code ?? ""));

  let score = 0;
  const reasons: string[] = [];
  if (sourceEmail && candidateEmail && sourceEmail === candidateEmail) {
    score += 95;
    reasons.push("exact_email");
  }
  if (sourcePhone && candidatePhone && candidatePhone.includes(sourcePhone)) {
    score += 85;
    reasons.push("exact_phone");
  }
  if (sourceFirst && sourceLast && sourceFirst === candidateFirst && sourceLast === candidateLast) {
    if (sourceAddress && candidateAddress && sourceAddress === candidateAddress) {
      score += 80;
      reasons.push("name_plus_address");
    } else if (
      (sourcePostal && candidatePostal && sourcePostal === candidatePostal) ||
      (sourceCity && sourceState && candidateCity === sourceCity && candidateState === sourceState)
    ) {
      score += 72;
      reasons.push("name_plus_city_state_or_postal");
    }
  }
  return { score, reasons };
}

export async function findLikelyContactMatch(input: {
  supabase: IntegrationClient;
  organizationId: string;
  source: Record<string, unknown>;
}): Promise<{
  matchContactId: string | null;
  confidenceScore: number | null;
  candidateMatches: Array<Record<string, unknown>>;
  shouldQueueReview: boolean;
}> {
  const email = normalizeEmail(readString(input.source, ["email", "primary_email"]));
  const phone = normalizePhone(
    readString(input.source, ["phone", "mobile_phone", "phone_number", "primary_phone"])
  );
  const first = readString(input.source, ["first_name", "firstName"]);
  const last = readString(input.source, ["last_name", "lastName"]);
  const city = readString(input.source, ["city", "address.city"]);
  const state = readString(input.source, ["state", "address.state"]);
  const postal = readString(input.source, ["postal_code", "zip", "address.postal_code"]);

  const candidates = new Map<string, ContactCandidate>();

  if (email) {
    const { data, error } = await input.supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone, alternate_phone, address_line_1, city, state, postal_code")
      .eq("organization_id", input.organizationId)
      .ilike("email", email)
      .limit(10);
    if (error) throw error;
    for (const row of (data ?? []) as ContactCandidate[]) {
      candidates.set(String(row.id), row);
    }
  }

  if (phone) {
    const { data, error } = await input.supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone, alternate_phone, address_line_1, city, state, postal_code")
      .eq("organization_id", input.organizationId)
      .or(`phone.eq.${phone},alternate_phone.eq.${phone}`)
      .limit(10);
    if (error) throw error;
    for (const row of (data ?? []) as ContactCandidate[]) {
      candidates.set(String(row.id), row);
    }
  }

  if (first && last) {
    const baseQuery = input.supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone, alternate_phone, address_line_1, city, state, postal_code")
      .eq("organization_id", input.organizationId)
      .ilike("first_name", first)
      .ilike("last_name", last)
      .limit(25);
    let query = baseQuery;
    if (postal) {
      query = query.eq("postal_code", postal);
    } else if (city && state) {
      query = query.eq("city", city).eq("state", state);
    }
    const { data, error } = await query;
    if (error) throw error;
    for (const row of (data ?? []) as ContactCandidate[]) {
      candidates.set(String(row.id), row);
    }
  }

  if (candidates.size === 0) {
    return {
      matchContactId: null,
      confidenceScore: null,
      candidateMatches: [],
      shouldQueueReview: false
    };
  }

  const scored = Array.from(candidates.values())
    .map((candidate) => {
      const scoring = scoreContactCandidate({
        source: input.source,
        candidate
      });
      return {
        ...candidate,
        confidence: scoring.score,
        reasons: scoring.reasons
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const top = scored[0];
  const second = scored[1];
  const topScore = Number(top?.confidence ?? 0);
  const secondScore = Number(second?.confidence ?? 0);

  if (topScore >= 90 && topScore - secondScore >= 5) {
    return {
      matchContactId: String(top.id),
      confidenceScore: topScore,
      candidateMatches: scored.slice(0, 5),
      shouldQueueReview: false
    };
  }

  if (topScore >= 80 && secondScore < 80) {
    return {
      matchContactId: String(top.id),
      confidenceScore: topScore,
      candidateMatches: scored.slice(0, 5),
      shouldQueueReview: false
    };
  }

  return {
    matchContactId: null,
    confidenceScore: topScore || null,
    candidateMatches: scored.slice(0, 5),
    shouldQueueReview: true
  };
}

export function extractCustomFieldsMap(record: Record<string, unknown>) {
  const custom = valueByPath(record, "custom_fields");
  if (Array.isArray(custom)) {
    const mapped: Record<string, unknown> = {};
    for (const item of custom) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const key = readString(row, ["id", "name", "key", "slug"]);
      const value = row.value ?? row.values ?? row.option ?? null;
      if (key) mapped[key] = value;
    }
    return mapped;
  }
  if (custom && typeof custom === "object" && !Array.isArray(custom)) {
    return custom as Record<string, unknown>;
  }
  return {};
}
