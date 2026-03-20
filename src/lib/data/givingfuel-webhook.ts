import crypto from "crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireImportCenterAccess,
  requireIntegrationManagerRole,
  requireSessionContext,
  requireStaffPermission
} from "@/lib/auth/guards";
import { createIntegrationClient } from "@/lib/integrations/db";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/integrations/secrets";
import {
  decideWebhookImportDisposition,
  matchCampaignFromMappings,
  matchDonorFromCandidates,
  normalizeEmail,
  normalizeLooseText,
  normalizePostalCode,
  type CampaignMappingCandidate,
  type DonorCandidate
} from "@/lib/integrations/webhook-framework";
import { GIVINGFUEL_WEBHOOK_INTEGRATION_KEY } from "@/lib/integrations/givingfuel-contacts-config";
import { logAuditEvent } from "@/lib/data/audit";

type GivingFuelNormalizedPayload = {
  providerEventId: string | null;
  eventType: string;
  idempotencyKey: string;
  externalTransactionId: string | null;
  externalPageId: string | null;
  externalPageKey: string | null;
  externalPageName: string | null;
  externalCampaignReference: string | null;
  donor: {
    externalDonorReference: string | null;
    firstName: string | null;
    lastName: string | null;
    organizationName: string | null;
    email: string | null;
    phone: string | null;
    postalCode: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
  };
  transaction: {
    amount: number | null;
    grossAmount: number | null;
    netAmount: number | null;
    fees: number | null;
    donationDate: string | null;
    paymentStatus: string | null;
    paymentMethod: string | null;
    isRecurring: boolean;
    recurringMetadata: Record<string, unknown>;
    tributeMetadata: Record<string, unknown>;
    status: string | null;
  };
  rawPayload: Record<string, unknown>;
};

type IntegrationConnectionRow = {
  id: string;
  organization_id: string;
  provider_key: string;
  is_enabled: boolean;
  allow_module_access?: boolean;
  configuration_json: Record<string, unknown> | null;
  sync_settings_json: Record<string, unknown> | null;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const numeric = Number(String(value ?? "").replace(/[,$\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseDate(value: unknown) {
  const text = toText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseBoolean(value: unknown) {
  const normalized = toText(value).toLowerCase();
  if (!normalized) return false;
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function pickObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function valueByPath(record: Record<string, unknown>, key: string) {
  if (!key.includes(".")) return record[key];
  const segments = key.split(".").map((segment) => segment.trim()).filter(Boolean);
  let cursor: unknown = record;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = valueByPath(record, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = valueByPath(record, key);
    const numeric = toNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function equalsSecure(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeGivingFuelPayload(rawPayload: Record<string, unknown>, rawBody: string) {
  const event = pickObject(rawPayload.event) ?? rawPayload;
  const data = pickObject(event.data) ?? event;
  const transaction =
    pickObject(data.transaction) ??
    pickObject(data.donation) ??
    pickObject(rawPayload.transaction) ??
    pickObject(rawPayload.donation) ??
    data;
  const donor =
    pickObject(transaction?.customer) ??
    pickObject(transaction?.donor) ??
    pickObject(data.customer) ??
    pickObject(data.donor) ??
    pickObject(rawPayload.customer) ??
    pickObject(rawPayload.donor) ??
    {};

  const externalTransactionId = readString(transaction ?? {}, [
    "id",
    "transactionId",
    "transaction_id",
    "displayId",
    "orderId",
    "externalTransactionId",
    "external_transaction_id"
  ]);
  const providerEventId = readString(event, [
    "id",
    "event_id",
    "eventId",
    "delivery_id",
    "deliveryId"
  ]);
  const eventType =
    readString(event, ["event_type", "eventType", "type", "action", "name"]) || "donation.received";
  const idempotencyKey =
    readString(event, ["idempotency_key", "idempotencyKey", "delivery_id"]) ||
    providerEventId ||
    externalTransactionId ||
    sha256Hex(rawBody);

  const recurringMetadata = pickObject(valueByPath(transaction ?? {}, "recurring")) ?? {};
  const tributeMetadata = pickObject(valueByPath(transaction ?? {}, "tribute")) ?? {};

  return {
    providerEventId: providerEventId || null,
    eventType,
    idempotencyKey,
    externalTransactionId: externalTransactionId || null,
    externalPageId:
      readString(transaction ?? {}, ["formId", "pageId", "page_id", "externalPageId"]) || null,
    externalPageKey:
      readString(transaction ?? {}, ["formAccRef", "pageKey", "page_key", "campaignCode"]) || null,
    externalPageName:
      readString(transaction ?? {}, ["formName", "pageName", "page_name", "Page Name"]) || null,
    externalCampaignReference:
      readString(transaction ?? {}, ["campaignCode", "designation", "fund", "formAccRef"]) || null,
    donor: {
      externalDonorReference:
        readString(donor, ["id", "customerId", "customer_id", "donorId", "donor_id"]) || null,
      firstName: readString(donor, ["firstName", "first_name", "billing.firstName"]) || null,
      lastName: readString(donor, ["lastName", "last_name", "billing.lastName"]) || null,
      organizationName:
        readString(donor, ["organizationName", "organization_name", "company"]) || null,
      email: readString(donor, ["email", "primaryEmail", "primary_email"]) || null,
      phone:
        readString(donor, ["phone", "mobile", "mobilePhone", "mobile_phone", "billing.phone"]) ||
        null,
      postalCode:
        readString(donor, ["postalCode", "postal_code", "zip", "zipCode", "billing.address.postalCode"]) ||
        null,
      addressLine1:
        readString(donor, ["address1", "address_line_1", "billing.address.street1"]) || null,
      city: readString(donor, ["city", "billing.address.city"]) || null,
      state: readString(donor, ["state", "billing.address.state"]) || null
    },
    transaction: {
      amount: readNumber(transaction ?? {}, ["amount", "total", "value"]),
      grossAmount: readNumber(transaction ?? {}, ["grossAmount", "gross_amount"]),
      netAmount: readNumber(transaction ?? {}, ["netAmount", "net_amount"]),
      fees: readNumber(transaction ?? {}, ["fees", "feeAmount", "fee_amount"]),
      donationDate:
        parseDate(
          readString(transaction ?? {}, [
            "dateCreated",
            "date",
            "donationDate",
            "donation_date",
            "created_at"
          ])
        ) ?? null,
      paymentStatus:
        readString(transaction ?? {}, ["paymentStatus", "payment_status", "status"]) || null,
      paymentMethod:
        readString(transaction ?? {}, ["paymentMethod", "payment_method", "method", "paymentType"]) ||
        null,
      isRecurring:
        parseBoolean(valueByPath(transaction ?? {}, "isRecurring")) ||
        parseBoolean(valueByPath(transaction ?? {}, "is_recurring")) ||
        parseBoolean(valueByPath(transaction ?? {}, "recurring.enabled")),
      recurringMetadata,
      tributeMetadata,
      status: readString(transaction ?? {}, ["status", "transactionStatus"]) || null
    },
    rawPayload
  } satisfies GivingFuelNormalizedPayload;
}

function verifyWebhookAuthenticity(input: {
  headers: Headers;
  rawBody: string;
  secret: string;
  signatureHeaderName: string;
  secretHeaderName: string;
}) {
  const signatureHeader = input.headers.get(input.signatureHeaderName) ?? "";
  const tokenHeader = input.headers.get(input.secretHeaderName) ?? "";
  if (!input.secret) {
    return { ok: false, reason: "Webhook secret is not configured for this connection." };
  }

  if (signatureHeader) {
    const normalizedProvided = signatureHeader.includes("=")
      ? signatureHeader.split("=").slice(1).join("=").trim()
      : signatureHeader.trim();
    const digest = crypto.createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
    if (normalizedProvided && equalsSecure(normalizedProvided, digest)) {
      return { ok: true, reason: "Signature validated." };
    }
    return { ok: false, reason: "Invalid webhook signature." };
  }

  if (tokenHeader && equalsSecure(tokenHeader.trim(), input.secret.trim())) {
    return { ok: true, reason: "Shared secret token validated." };
  }

  return { ok: false, reason: "Missing webhook signature/token." };
}

function paymentTypeFromMethod(method: string | null) {
  const normalized = toText(method).toLowerCase();
  if (!normalized) return "Cash";
  if (normalized.includes("check")) return "Check";
  if (normalized.includes("card") || normalized.includes("credit") || normalized.includes("debit")) {
    return "Card";
  }
  return "Cash";
}

function donationStatusFromPaymentStatus(value: string | null) {
  const normalized = toText(value).toLowerCase();
  if (!normalized) return "posted";
  if (normalized.includes("pending")) return "pending";
  if (normalized.includes("failed")) return "failed";
  if (normalized.includes("refund")) return "refunded";
  return "posted";
}

async function loadWebhookConnectionById(connectionId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("integration_connections")
    .select("id, organization_id, is_enabled, allow_module_access, configuration_json, sync_settings_json, integration_definitions(provider_key)")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const definition = Array.isArray(data.integration_definitions)
    ? data.integration_definitions[0]
    : data.integration_definitions;
  return {
    id: String(data.id),
    organization_id: String(data.organization_id),
    provider_key: String((definition as { provider_key?: string } | null)?.provider_key ?? ""),
    is_enabled: Boolean(data.is_enabled),
    allow_module_access: Boolean(data.allow_module_access),
    configuration_json:
      (data.configuration_json as Record<string, unknown> | null | undefined) ?? {},
    sync_settings_json:
      (data.sync_settings_json as Record<string, unknown> | null | undefined) ?? {}
  } satisfies IntegrationConnectionRow;
}

async function findCampaignMatch(input: {
  supabase: ReturnType<typeof createAdminClient>;
  organizationId: string;
  connectionId: string;
  normalized: GivingFuelNormalizedPayload;
}) {
  const { data: mappingRows, error: mappingError } = await input.supabase
    .from("givingfuel_campaign_mappings")
    .select("crm_campaign_id, external_page_id, external_page_key, external_page_name, is_active")
    .eq("organization_id", input.organizationId)
    .eq("integration_connection_id", input.connectionId)
    .eq("is_active", true);
  if (mappingError) throw mappingError;

  const { data: campaignRows, error: campaignError } = await input.supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("organization_id", input.organizationId)
    .eq("status", "Active");
  if (campaignError) throw campaignError;

  const candidates: CampaignMappingCandidate[] = [
    ...((mappingRows ?? []).map((row) => ({
      crmCampaignId: String(row.crm_campaign_id ?? ""),
      externalPageId: toText(row.external_page_id) || null,
      externalPageKey: toText(row.external_page_key) || null,
      externalPageName: toText(row.external_page_name) || null,
      isActive: Boolean(row.is_active)
    })) as CampaignMappingCandidate[]),
    ...((campaignRows ?? []).map((row) => ({
      crmCampaignId: String(row.id ?? ""),
      externalPageName: toText(row.name) || null,
      isActive: true
    })) as CampaignMappingCandidate[])
  ];

  return matchCampaignFromMappings(
    {
      externalPageId: input.normalized.externalPageId,
      externalPageKey: input.normalized.externalPageKey,
      externalCampaignReference: input.normalized.externalCampaignReference,
      externalPageName: input.normalized.externalPageName
    },
    candidates
  );
}

async function collectDonorCandidates(input: {
  supabase: ReturnType<typeof createAdminClient>;
  organizationId: string;
  donor: GivingFuelNormalizedPayload["donor"];
}) {
  const ids = new Set<string>();
  const externalReference = toText(input.donor.externalDonorReference);
  const normalizedEmail = normalizeEmail(input.donor.email);
  const firstName = normalizeLooseText(input.donor.firstName);
  const lastName = normalizeLooseText(input.donor.lastName);
  const postal = normalizePostalCode(input.donor.postalCode);

  if (externalReference) {
    const { data: referenceRows, error: refError } = await input.supabase
      .from("contact_external_references")
      .select("contact_id")
      .eq("organization_id", input.organizationId)
      .in("source_system", ["givingfuel", "givingfuel_webhook", "webconnex"])
      .eq("external_record_id", externalReference);
    if (refError) throw refError;
    for (const row of referenceRows ?? []) {
      const id = toText(row.contact_id);
      if (id) ids.add(id);
    }
  }

  if (normalizedEmail) {
    const { data: emailRows, error: emailError } = await input.supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("email", normalizedEmail)
      .limit(25);
    if (emailError) throw emailError;
    for (const row of emailRows ?? []) ids.add(toText(row.id));
  }

  if (firstName && lastName) {
    let nameQuery = input.supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
      .limit(50);
    if (postal) {
      nameQuery = nameQuery.eq("postal_code", postal);
    }
    const { data: nameRows, error: nameError } = await nameQuery;
    if (nameError) throw nameError;
    for (const row of nameRows ?? []) ids.add(toText(row.id));
  }

  if (ids.size === 0) return [] as DonorCandidate[];

  const idList = Array.from(ids);
  const { data: contactRows, error: contactsError } = await input.supabase
    .from("contacts")
    .select("id, first_name, last_name, email, postal_code, phone, mobile_number, alternate_phone")
    .eq("organization_id", input.organizationId)
    .in("id", idList);
  if (contactsError) throw contactsError;

  const { data: externalRefs, error: refsError } = await input.supabase
    .from("contact_external_references")
    .select("contact_id, external_record_id")
    .eq("organization_id", input.organizationId)
    .in("contact_id", idList)
    .in("source_system", ["givingfuel", "givingfuel_webhook", "webconnex"]);
  if (refsError) throw refsError;

  const refsByContact = new Map<string, string[]>();
  for (const ref of externalRefs ?? []) {
    const id = toText(ref.contact_id);
    const external = toText(ref.external_record_id);
    if (!id || !external) continue;
    const list = refsByContact.get(id) ?? [];
    if (!list.includes(external)) list.push(external);
    refsByContact.set(id, list);
  }

  return (contactRows ?? []).map((row) => {
    const id = toText(row.id);
    return {
      id,
      firstName: toText(row.first_name) || null,
      lastName: toText(row.last_name) || null,
      email: toText(row.email) || null,
      postalCode: toText(row.postal_code) || null,
      phone: toText(row.phone) || toText(row.mobile_number) || toText(row.alternate_phone) || null,
      externalReferences: refsByContact.get(id) ?? []
    } satisfies DonorCandidate;
  });
}

async function createDonorFromWebhook(input: {
  supabase: ReturnType<typeof createAdminClient>;
  organizationId: string;
  donor: GivingFuelNormalizedPayload["donor"];
}) {
  const hasOrganizationName = Boolean(toText(input.donor.organizationName));
  const entityType = hasOrganizationName ? "organization" : "person";
  const firstName =
    toText(input.donor.firstName) ||
    (hasOrganizationName ? toText(input.donor.organizationName) : "Imported");
  const lastName = toText(input.donor.lastName) || (hasOrganizationName ? "(Organization)" : "(Imported)");
  const email = normalizeEmail(input.donor.email) || null;
  const phone = toText(input.donor.phone) || null;
  const externalDonorReference = toText(input.donor.externalDonorReference);
  const organizationName = hasOrganizationName ? toText(input.donor.organizationName) : null;

  const { data, error } = await input.supabase
    .from("contacts")
    .insert({
      organization_id: input.organizationId,
      first_name: firstName,
      last_name: lastName,
      organization_name: organizationName,
      entity_type: entityType,
      tracking_status: "donor",
      donor_status: "active",
      member_status: "none",
      email,
      phone,
      address_line_1: toText(input.donor.addressLine1) || null,
      city: toText(input.donor.city) || null,
      state: toText(input.donor.state) || null,
      postal_code: toText(input.donor.postalCode) || null,
      external_source: "givingfuel_webhook",
      external_source_id: externalDonorReference || null
    })
    .select("id")
    .single();
  if (error) throw error;
  const contactId = toText(data.id);

  if (externalDonorReference) {
    const { error: refError } = await input.supabase.from("contact_external_references").upsert(
      {
        organization_id: input.organizationId,
        contact_id: contactId,
        source_system: "givingfuel_webhook",
        external_record_id: externalDonorReference,
        external_record_type: "donor",
        last_synced_date: new Date().toISOString()
      },
      { onConflict: "organization_id,source_system,external_record_id" }
    );
    if (refError) throw refError;
  }

  return contactId;
}

async function createDonationFromImport(input: {
  supabase: ReturnType<typeof createAdminClient>;
  organizationId: string;
  donorId: string;
  campaignId: string;
  normalized: GivingFuelNormalizedPayload;
}) {
  const externalTransactionId = toText(input.normalized.externalTransactionId);
  if (!externalTransactionId) {
    throw new Error("External transaction ID is required for donation creation.");
  }
  const { data: existing, error: existingError } = await input.supabase
    .from("donations")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("source_platform", "givingfuel_webhook")
    .eq("external_transaction_id", externalTransactionId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return toText(existing.id);

  const amount = input.normalized.transaction.amount;
  if (!Number.isFinite(amount) || Number(amount) <= 0) {
    throw new Error("Transaction amount is missing or invalid.");
  }

  const { data: campaign, error: campaignError } = await input.supabase
    .from("campaigns")
    .select("name")
    .eq("organization_id", input.organizationId)
    .eq("id", input.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;

  const donationDate =
    input.normalized.transaction.donationDate ?? new Date().toISOString().slice(0, 10);
  const { data: created, error: insertError } = await input.supabase
    .from("donations")
    .insert({
      organization_id: input.organizationId,
      contact_id: input.donorId,
      campaign_id: input.campaignId,
      amount,
      currency: "USD",
      donation_date: donationDate,
      status: donationStatusFromPaymentStatus(input.normalized.transaction.paymentStatus),
      payment_method: input.normalized.transaction.paymentMethod,
      payment_type: paymentTypeFromMethod(input.normalized.transaction.paymentMethod),
      source: "integration_webhook",
      source_platform: "givingfuel_webhook",
      external_transaction_id: externalTransactionId,
      transaction_id: externalTransactionId,
      campaign: toText(campaign?.name) || toText(input.normalized.externalPageName) || null,
      memo: JSON.stringify({
        sourcePageId: input.normalized.externalPageId,
        sourcePageKey: input.normalized.externalPageKey,
        sourcePageName: input.normalized.externalPageName,
        sourceCampaignReference: input.normalized.externalCampaignReference,
        grossAmount: input.normalized.transaction.grossAmount,
        netAmount: input.normalized.transaction.netAmount,
        fees: input.normalized.transaction.fees,
        recurringMetadata: input.normalized.transaction.recurringMetadata,
        tributeMetadata: input.normalized.transaction.tributeMetadata
      }),
      is_recurring: input.normalized.transaction.isRecurring
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  const donationId = toText(created.id);
  const { error: refError } = await input.supabase.from("donation_external_references").upsert(
    {
      organization_id: input.organizationId,
      donation_id: donationId,
      source_system: "givingfuel_webhook",
      external_record_id: externalTransactionId,
      external_record_type: "transaction",
      external_contact_id: toText(input.normalized.donor.externalDonorReference) || null,
      last_synced_date: new Date().toISOString()
    },
    { onConflict: "organization_id,source_system,external_record_id" }
  );
  if (refError) throw refError;

  return donationId;
}

export async function processGivingFuelWebhookRequest(input: {
  connectionId: string;
  headers: Headers;
  rawBody: string;
}) {
  const supabase = createAdminClient();
  const connection = await loadWebhookConnectionById(input.connectionId);
  if (!connection) {
    return {
      statusCode: 404,
      body: { message: "Integration connection not found." }
    };
  }
  if (connection.provider_key !== GIVINGFUEL_WEBHOOK_INTEGRATION_KEY) {
    return {
      statusCode: 400,
      body: { message: "Connection is not configured for GivingFuel Webhook." }
    };
  }

  let rawPayload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(input.rawBody);
    rawPayload = pickObject(parsed) ?? {};
  } catch {
    const eventIdempotencyKey = sha256Hex(input.rawBody || `${Date.now()}`);
    const { data: invalidEvent } = await supabase
      .from("integration_webhook_events")
      .insert({
        organization_id: connection.organization_id,
        integration_connection_id: connection.id,
        provider_key: connection.provider_key,
        provider_event_id: null,
        event_type: "invalid_json",
        processing_status: "invalid",
        processing_attempts: 1,
        request_headers: Object.fromEntries(input.headers.entries()),
        raw_payload_json: {},
        normalized_payload_json: {},
        error_message: "Webhook payload is not valid JSON.",
        idempotency_key: eventIdempotencyKey,
        received_at: new Date().toISOString(),
        processed_at: new Date().toISOString()
      })
      .select("id")
      .maybeSingle();
    return {
      statusCode: 400,
      body: {
        message: "Invalid JSON payload.",
        eventId: toText(invalidEvent?.id) || null
      }
    };
  }

  const normalized = normalizeGivingFuelPayload(rawPayload, input.rawBody);
  const config = (connection.configuration_json ?? {}) as Record<string, unknown>;
  const signatureHeaderName = toText(config.signatureHeaderName) || "x-givingfuel-signature";
  const secretHeaderName = toText(config.secretHeaderName) || "x-givingfuel-secret";
  const encryptedSecret = toText(config.encryptedWebhookSecret);
  const webhookSecret = encryptedSecret ? decryptIntegrationSecret(encryptedSecret) : "";

  const verify = verifyWebhookAuthenticity({
    headers: input.headers,
    rawBody: input.rawBody,
    secret: webhookSecret,
    signatureHeaderName,
    secretHeaderName
  });

  const eventInsert = await supabase
    .from("integration_webhook_events")
    .insert({
      organization_id: connection.organization_id,
      integration_connection_id: connection.id,
      provider_key: connection.provider_key,
      provider_event_id: normalized.providerEventId,
      event_type: normalized.eventType,
      processing_status: verify.ok ? "pending" : "invalid",
      processing_attempts: 1,
      request_headers: Object.fromEntries(input.headers.entries()),
      raw_payload_json: rawPayload,
      normalized_payload_json: normalized as unknown as Record<string, unknown>,
      error_message: verify.ok ? null : verify.reason,
      idempotency_key: normalized.idempotencyKey,
      received_at: new Date().toISOString(),
      processed_at: verify.ok ? null : new Date().toISOString()
    })
    .select("id, processing_status, created_transaction_id")
    .maybeSingle();

  if (eventInsert.error) {
    const code = (eventInsert.error as { code?: string }).code;
    if (code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("integration_webhook_events")
        .select("id, processing_status, created_transaction_id")
        .eq("organization_id", connection.organization_id)
        .eq("integration_connection_id", connection.id)
        .eq("idempotency_key", normalized.idempotencyKey)
        .maybeSingle();
      if (existingError) throw existingError;
      return {
        statusCode: 200,
        body: {
          message: "Duplicate delivery ignored.",
          duplicate: true,
          eventId: toText(existing?.id) || null,
          processingStatus: toText(existing?.processing_status) || "duplicate",
          createdTransactionId: toText(existing?.created_transaction_id) || null
        }
      };
    }
    throw eventInsert.error;
  }

  const eventId = toText(eventInsert.data?.id);
  if (!verify.ok) {
    return {
      statusCode: 401,
      body: {
        message: verify.reason,
        eventId
      }
    };
  }

  if (!connection.is_enabled) {
    await supabase
      .from("integration_webhook_events")
      .update({
        processing_status: "ignored",
        processed_at: new Date().toISOString(),
        error_message: "Integration is disabled. Event stored but not processed."
      })
      .eq("id", eventId);
    return {
      statusCode: 202,
      body: {
        message: "Integration is disabled. Event stored for audit only.",
        eventId
      }
    };
  }

  let transactionImportId: string | null = null;
  try {
    const mappingResult = await findCampaignMatch({
      supabase,
      organizationId: connection.organization_id,
      connectionId: connection.id,
      normalized
    });
    const donorCandidates = await collectDonorCandidates({
      supabase,
      organizationId: connection.organization_id,
      donor: normalized.donor
    });
    const donorMatch = matchDonorFromCandidates(
      {
        externalDonorReference: normalized.donor.externalDonorReference,
        email: normalized.donor.email,
        firstName: normalized.donor.firstName,
        lastName: normalized.donor.lastName,
        postalCode: normalized.donor.postalCode,
        phone: normalized.donor.phone
      },
      donorCandidates
    );

    const settings = {
      autoAcceptDonorConfidence: Number(config.autoAcceptDonorConfidence ?? 95),
      autoAcceptCampaignConfidence: Number(config.autoAcceptCampaignConfidence ?? 100),
      autoCreateUnmatchedDonor: Boolean(config.autoCreateUnmatchedDonor),
      blockLowConfidenceCampaign: Boolean(config.blockLowConfidenceCampaign ?? true),
      holdAmbiguousDonorMatches: Boolean(config.holdAmbiguousDonorMatches ?? true)
    };
    const decision = decideWebhookImportDisposition({
      campaignMatch: mappingResult,
      donorMatch,
      settings
    });

    const importInsert = await supabase
      .from("integration_transaction_imports")
      .insert({
        organization_id: connection.organization_id,
        integration_connection_id: connection.id,
        webhook_event_id: eventId,
        provider_key: connection.provider_key,
        external_transaction_id: normalized.externalTransactionId,
        external_page_id: normalized.externalPageId,
        external_campaign_reference:
          normalized.externalCampaignReference ?? normalized.externalPageName,
        external_donor_reference: normalized.donor.externalDonorReference,
        matched_campaign_id: mappingResult.matchedCampaignId,
        matched_donor_id: donorMatch.matchedDonorId,
        donor_match_confidence: donorMatch.confidence,
        campaign_match_confidence: mappingResult.confidence,
        donor_match_rule: donorMatch.rule,
        campaign_match_rule: mappingResult.rule,
        review_status: decision.shouldAutoAccept ? "auto_accepted" : "pending_review",
        review_notes: decision.reviewReason,
        import_status: decision.shouldAutoAccept ? "ready_to_import" : "pending",
        normalized_donor_json: normalized.donor as unknown as Record<string, unknown>,
        normalized_transaction_json: normalized.transaction as unknown as Record<string, unknown>,
        matching_details_json: {
          campaignMatch: mappingResult,
          donorMatch,
          decision
        }
      })
      .select("id")
      .single();
    if (importInsert.error) throw importInsert.error;
    transactionImportId = toText(importInsert.data.id);

    if (!decision.shouldAutoAccept) {
      await supabase
        .from("integration_webhook_events")
        .update({
          processing_status: "needs_review",
          processed_at: new Date().toISOString(),
          error_message: decision.reviewReason
        })
        .eq("id", eventId);
      return {
        statusCode: 202,
        body: {
          message: "Event accepted and queued for review.",
          eventId,
          transactionImportId,
          processingStatus: "needs_review"
        }
      };
    }

    let donorId = donorMatch.matchedDonorId;
    if (!donorId && decision.shouldCreateDonor) {
      donorId = await createDonorFromWebhook({
        supabase,
        organizationId: connection.organization_id,
        donor: normalized.donor
      });
    }
    if (!donorId) {
      await supabase
        .from("integration_transaction_imports")
        .update({
          review_status: "pending_review",
          import_status: "pending",
          review_notes: "Donor could not be resolved automatically."
        })
        .eq("id", transactionImportId);
      await supabase
        .from("integration_webhook_events")
        .update({
          processing_status: "needs_review",
          processed_at: new Date().toISOString(),
          error_message: "Donor could not be resolved automatically."
        })
        .eq("id", eventId);
      return {
        statusCode: 202,
        body: {
          message: "Event accepted but queued for review due to donor resolution.",
          eventId,
          transactionImportId,
          processingStatus: "needs_review"
        }
      };
    }

    const donationId = await createDonationFromImport({
      supabase,
      organizationId: connection.organization_id,
      donorId,
      campaignId: String(mappingResult.matchedCampaignId),
      normalized
    });

    await supabase
      .from("integration_transaction_imports")
      .update({
        matched_donor_id: donorId,
        created_crm_transaction_id: donationId,
        import_status: "imported",
        review_status: "auto_accepted",
        approved_at: new Date().toISOString(),
        review_notes: "Automatically accepted by configured confidence thresholds."
      })
      .eq("id", transactionImportId);

    await supabase
      .from("integration_webhook_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        created_transaction_id: donationId,
        error_message: null
      })
      .eq("id", eventId);

    return {
      statusCode: 200,
      body: {
        message: "Event processed successfully.",
        eventId,
        transactionImportId,
        createdTransactionId: donationId,
        processingStatus: "processed"
      }
    };
  } catch (processingError) {
    const message =
      processingError instanceof Error ? processingError.message : "Webhook processing failed.";
    if (transactionImportId) {
      await supabase
        .from("integration_transaction_imports")
        .update({
          import_status: "failed",
          review_status: "pending_review",
          processed_error: message
        })
        .eq("id", transactionImportId);
    }
    await supabase
      .from("integration_webhook_events")
      .update({
        processing_status: "failed",
        processed_at: new Date().toISOString(),
        error_message: message
      })
      .eq("id", eventId);
    return {
      statusCode: 500,
      body: {
        message,
        eventId,
        transactionImportId,
        processingStatus: "failed"
      }
    };
  }
}

async function getWebhookConnectionForOrganization(organizationId: string) {
  const supabase = await createIntegrationClient();
  const { data, error } = await supabase
    .from("integration_connections")
    .select("id, is_enabled, allow_module_access, configuration_json, sync_settings_json, integration_definitions(provider_key)")
    .eq("organization_id", organizationId);
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  for (const row of rows) {
    const definition = Array.isArray(row.integration_definitions)
      ? row.integration_definitions[0]
      : row.integration_definitions;
    const providerKey = toText((definition as { provider_key?: unknown } | null)?.provider_key);
    if (providerKey === GIVINGFUEL_WEBHOOK_INTEGRATION_KEY) {
      return {
        id: toText(row.id),
        isEnabled: Boolean(row.is_enabled),
        allowModuleAccess: Boolean(row.allow_module_access),
        configuration: (row.configuration_json as Record<string, unknown> | null | undefined) ?? {},
        syncSettings: (row.sync_settings_json as Record<string, unknown> | null | undefined) ?? {}
      };
    }
  }
  return null;
}

export async function getGivingFuelModuleStateForCurrentUser() {
  const context = await requireSessionContext();
  const connection = await getWebhookConnectionForOrganization(context.organizationId);
  if (!connection) {
    return {
      connectionId: null,
      integrationEnabled: false,
      allowModuleAccess: false,
      pendingReviewCount: 0,
      failedEventsCount: 0
    };
  }
  const supabase = await createIntegrationClient();
  const [{ count: pendingCount }, { count: failedCount }] = await Promise.all([
    supabase
      .from("integration_transaction_imports")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", connection.id)
      .eq("review_status", "pending_review"),
    supabase
      .from("integration_webhook_events")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", connection.id)
      .in("processing_status", ["failed", "invalid"])
  ]);

  return {
    connectionId: connection.id,
    integrationEnabled: connection.isEnabled,
    allowModuleAccess: connection.allowModuleAccess,
    pendingReviewCount: pendingCount ?? 0,
    failedEventsCount: failedCount ?? 0
  };
}

export async function requireGivingFuelOperationalAccess() {
  const context = await requireImportCenterAccess();
  const state = await getGivingFuelModuleStateForCurrentUser();
  if (!state.allowModuleAccess) {
    redirect("/unauthorized");
  }
  return { ...context, moduleState: state };
}

export async function getGivingFuelOperationalDashboard() {
  const context = await requireGivingFuelOperationalAccess();
  const state = context.moduleState;
  const supabase = await createIntegrationClient();
  if (!state.connectionId) {
    return {
      moduleState: state,
      summary: {
        pendingReview: 0,
        processed: 0,
        failed: 0,
        ignored: 0
      },
      recentEvents: []
    };
  }

  const [{ count: processedCount }, { count: ignoredCount }, recentResult] = await Promise.all([
    supabase
      .from("integration_webhook_events")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", state.connectionId)
      .eq("processing_status", "processed"),
    supabase
      .from("integration_webhook_events")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", state.connectionId)
      .eq("processing_status", "ignored"),
    supabase
      .from("integration_webhook_events")
      .select("id, provider_event_id, event_type, received_at, processed_at, processing_status, error_message, created_transaction_id")
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", state.connectionId)
      .order("received_at", { ascending: false })
      .limit(25)
  ]);
  if (recentResult.error) throw recentResult.error;

  return {
    moduleState: state,
    summary: {
      pendingReview: state.pendingReviewCount,
      processed: processedCount ?? 0,
      failed: state.failedEventsCount,
      ignored: ignoredCount ?? 0
    },
    recentEvents: recentResult.data ?? []
  };
}

export async function getGivingFuelPageCampaignConfiguration(): Promise<{
  campaigns: Array<{ id: string; name: string; status: string }>;
  mappings: Array<{
    id: string;
    external_page_id: string;
    external_page_key: string | null;
    external_page_name: string | null;
    crm_campaign_id: string;
    is_active: boolean;
    notes: string | null;
  }>;
}> {
  const context = await requireGivingFuelOperationalAccess();
  const state = context.moduleState;
  if (!state.connectionId) {
    return {
      campaigns: [],
      mappings: []
    };
  }

  const supabase = await createIntegrationClient();
  const [campaignsResult, mappingsResult] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("organization_id", context.organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("givingfuel_campaign_mappings")
      .select(
        "id, external_page_id, external_page_key, external_page_name, crm_campaign_id, is_active, notes, created_at, updated_at"
      )
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", state.connectionId)
      .order("updated_at", { ascending: false })
  ]);
  if (campaignsResult.error) throw campaignsResult.error;
  if (mappingsResult.error) throw mappingsResult.error;

  return {
    campaigns: (campaignsResult.data ?? []).map((row) => ({
      id: toText(row.id),
      name: toText(row.name),
      status: toText(row.status)
    })),
    mappings: (mappingsResult.data ?? []).map((row) => ({
      id: toText(row.id),
      external_page_id: toText(row.external_page_id),
      external_page_key: toText(row.external_page_key) || null,
      external_page_name: toText(row.external_page_name) || null,
      crm_campaign_id: toText(row.crm_campaign_id),
      is_active: parseBoolean(row.is_active),
      notes: toText(row.notes) || null
    }))
  };
}

export async function listGivingFuelReviewQueue(filters?: {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  campaignId?: string;
  minDonorConfidence?: number;
  search?: string;
}) {
  const context = await requireGivingFuelOperationalAccess();
  const state = context.moduleState;
  if (!state.connectionId) return { moduleState: state, rows: [] as Array<Record<string, unknown>> };

  const supabase = await createIntegrationClient();
  let query = supabase
    .from("integration_transaction_imports")
    .select(
      "id, external_transaction_id, external_page_id, matched_campaign_id, matched_donor_id, donor_match_confidence, campaign_match_confidence, donor_match_rule, campaign_match_rule, review_status, import_status, review_notes, created_crm_transaction_id, created_at, updated_at, normalized_donor_json, normalized_transaction_json"
    )
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", state.connectionId)
    .order("created_at", { ascending: false })
    .limit(250);

  if (filters?.status) query = query.eq("review_status", filters.status);
  if (filters?.campaignId) query = query.eq("matched_campaign_id", filters.campaignId);
  if (typeof filters?.minDonorConfidence === "number") {
    query = query.gte("donor_match_confidence", filters.minDonorConfidence);
  }
  if (filters?.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters?.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const search = normalizeLooseText(filters?.search);
  if (!search) return { moduleState: state, rows };

  return {
    moduleState: state,
    rows: rows.filter((row) => {
      const donor = pickObject(row.normalized_donor_json) ?? {};
      const donorName = normalizeLooseText(
        `${toText(donor.firstName)} ${toText(donor.lastName)} ${toText(donor.organizationName)}`
      );
      const email = normalizeLooseText(toText(donor.email));
      const tx = normalizeLooseText(toText(row.external_transaction_id));
      const page = normalizeLooseText(toText(row.external_page_id));
      return donorName.includes(search) || email.includes(search) || tx.includes(search) || page.includes(search);
    })
  };
}

export async function getGivingFuelReviewDetail(importId: string) {
  const context = await requireGivingFuelOperationalAccess();
  const state = context.moduleState;
  if (!state.connectionId) throw new Error("GivingFuel module is not configured.");
  const supabase = await createIntegrationClient();

  const importResult = await supabase
    .from("integration_transaction_imports")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", state.connectionId)
    .eq("id", importId)
    .maybeSingle();
  if (importResult.error) throw importResult.error;
  if (!importResult.data) throw new Error("Review item not found.");

  const [eventResult, actionsResult] = await Promise.all([
    supabase
      .from("integration_webhook_events")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", state.connectionId)
      .eq("id", toText(importResult.data.webhook_event_id))
      .maybeSingle(),
    supabase
      .from("integration_review_actions")
      .select("id, action_type, performed_by_user_id, previous_values_json, new_values_json, notes, created_at")
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", state.connectionId)
      .eq("transaction_import_id", importId)
      .order("created_at", { ascending: false })
  ]);
  if (eventResult.error) throw eventResult.error;
  if (actionsResult.error) throw actionsResult.error;

  return {
    moduleState: state,
    item: importResult.data,
    event: eventResult.data ?? null,
    actions: actionsResult.data ?? []
  };
}

async function writeReviewAction(input: {
  organizationId: string;
  connectionId: string;
  transactionImportId: string;
  actionType: string;
  performedByUserId: string;
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  notes?: string | null;
}) {
  const supabase = await createIntegrationClient();
  const { error } = await supabase.from("integration_review_actions").insert({
    organization_id: input.organizationId,
    integration_connection_id: input.connectionId,
    transaction_import_id: input.transactionImportId,
    action_type: input.actionType,
    performed_by_user_id: input.performedByUserId,
    previous_values_json: input.previousValues,
    new_values_json: input.newValues,
    notes: input.notes ?? null
  });
  if (error) throw error;
}

export async function approveGivingFuelReviewItem(input: {
  importId: string;
  campaignId?: string | null;
  donorId?: string | null;
  createNewDonor?: boolean;
  notes?: string | null;
}) {
  const context = await requireStaffPermission("can_edit_donations");
  const moduleState = await getGivingFuelModuleStateForCurrentUser();
  if (!moduleState.allowModuleAccess || !moduleState.connectionId) {
    throw new Error("GivingFuel module is not available.");
  }

  const supabase = createAdminClient();
  const { data: item, error: itemError } = await supabase
    .from("integration_transaction_imports")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", moduleState.connectionId)
    .eq("id", input.importId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) throw new Error("Review item not found.");

  const normalizedDonor =
    (item.normalized_donor_json as Record<string, unknown> | null | undefined) ?? {};
  const normalizedTransaction =
    (item.normalized_transaction_json as Record<string, unknown> | null | undefined) ?? {};
  const previousValues = {
    matched_campaign_id: item.matched_campaign_id,
    matched_donor_id: item.matched_donor_id,
    review_status: item.review_status,
    import_status: item.import_status
  };
  const campaignId = toText(input.campaignId) || toText(item.matched_campaign_id);
  if (!campaignId) throw new Error("Campaign assignment is required before approval.");

  let donorId = toText(input.donorId) || toText(item.matched_donor_id);
  if (!donorId && input.createNewDonor) {
    donorId = await createDonorFromWebhook({
      supabase,
      organizationId: context.organizationId,
      donor: {
        externalDonorReference: toText(normalizedDonor.externalDonorReference) || null,
        firstName: toText(normalizedDonor.firstName) || null,
        lastName: toText(normalizedDonor.lastName) || null,
        organizationName: toText(normalizedDonor.organizationName) || null,
        email: toText(normalizedDonor.email) || null,
        phone: toText(normalizedDonor.phone) || null,
        postalCode: toText(normalizedDonor.postalCode) || null,
        addressLine1: toText(normalizedDonor.addressLine1) || null,
        city: toText(normalizedDonor.city) || null,
        state: toText(normalizedDonor.state) || null
      }
    });
  }
  if (!donorId) {
    throw new Error("Donor assignment is required before approval.");
  }

  const normalized = {
    providerEventId: null,
    eventType: "review_approval",
    idempotencyKey: toText(item.external_transaction_id) || `review:${input.importId}`,
    externalTransactionId: toText(item.external_transaction_id) || null,
    externalPageId: toText(item.external_page_id) || null,
    externalPageKey: null,
    externalPageName: toText(item.external_campaign_reference) || null,
    externalCampaignReference: toText(item.external_campaign_reference) || null,
    donor: {
      externalDonorReference: toText(item.external_donor_reference) || null,
      firstName: toText(normalizedDonor.firstName) || null,
      lastName: toText(normalizedDonor.lastName) || null,
      organizationName: toText(normalizedDonor.organizationName) || null,
      email: toText(normalizedDonor.email) || null,
      phone: toText(normalizedDonor.phone) || null,
      postalCode: toText(normalizedDonor.postalCode) || null,
      addressLine1: toText(normalizedDonor.addressLine1) || null,
      city: toText(normalizedDonor.city) || null,
      state: toText(normalizedDonor.state) || null
    },
    transaction: {
      amount: toNumber(normalizedTransaction.amount),
      grossAmount: toNumber(normalizedTransaction.grossAmount),
      netAmount: toNumber(normalizedTransaction.netAmount),
      fees: toNumber(normalizedTransaction.fees),
      donationDate: toText(normalizedTransaction.donationDate) || null,
      paymentStatus: toText(normalizedTransaction.paymentStatus) || null,
      paymentMethod: toText(normalizedTransaction.paymentMethod) || null,
      isRecurring: parseBoolean(normalizedTransaction.isRecurring),
      recurringMetadata:
        (pickObject(normalizedTransaction.recurringMetadata) as Record<string, unknown> | null) ?? {},
      tributeMetadata:
        (pickObject(normalizedTransaction.tributeMetadata) as Record<string, unknown> | null) ?? {},
      status: toText(normalizedTransaction.status) || null
    },
    rawPayload: {}
  } satisfies GivingFuelNormalizedPayload;

  const donationId = await createDonationFromImport({
    supabase,
    organizationId: context.organizationId,
    donorId,
    campaignId,
    normalized
  });

  const corrected =
    campaignId !== toText(item.matched_campaign_id) || donorId !== toText(item.matched_donor_id);
  const reviewStatus = corrected ? "corrected" : "approved";
  const { error: updateError } = await supabase
    .from("integration_transaction_imports")
    .update({
      matched_campaign_id: campaignId,
      matched_donor_id: donorId,
      review_status: reviewStatus,
      import_status: "imported",
      created_crm_transaction_id: donationId,
      approved_by_user_id: context.userId,
      approved_at: new Date().toISOString(),
      review_notes: toText(input.notes) || null
    })
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", moduleState.connectionId)
    .eq("id", input.importId);
  if (updateError) throw updateError;

  await supabase
    .from("integration_webhook_events")
    .update({
      processing_status: "processed",
      processed_at: new Date().toISOString(),
      created_transaction_id: donationId,
      error_message: null
    })
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", moduleState.connectionId)
    .eq("id", toText(item.webhook_event_id));

  await writeReviewAction({
    organizationId: context.organizationId,
    connectionId: moduleState.connectionId,
    transactionImportId: input.importId,
    actionType: corrected ? "approve_corrected" : "approve",
    performedByUserId: context.userId,
    previousValues,
    newValues: {
      matched_campaign_id: campaignId,
      matched_donor_id: donorId,
      review_status: reviewStatus,
      import_status: "imported",
      created_crm_transaction_id: donationId
    },
    notes: input.notes
  });

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "givingfuel_review_approved",
    targetEntityType: "integration_transaction_imports",
    targetEntityId: input.importId,
    metadata: {
      corrected,
      campaignId,
      donorId,
      donationId
    }
  });

  return { ok: true, corrected, donationId };
}

export async function rejectGivingFuelReviewItem(input: {
  importId: string;
  action: "reject" | "ignore";
  notes?: string | null;
}) {
  const context = await requireStaffPermission("can_edit_donations");
  const moduleState = await getGivingFuelModuleStateForCurrentUser();
  if (!moduleState.allowModuleAccess || !moduleState.connectionId) {
    throw new Error("GivingFuel module is not available.");
  }

  const supabase = await createIntegrationClient();
  const { data: item, error: loadError } = await supabase
    .from("integration_transaction_imports")
    .select("id, webhook_event_id, review_status, import_status")
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", moduleState.connectionId)
    .eq("id", input.importId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!item) throw new Error("Review item not found.");

  const reviewStatus = input.action === "reject" ? "rejected" : "ignored";
  const { error } = await supabase
    .from("integration_transaction_imports")
    .update({
      review_status: reviewStatus,
      import_status: "ignored",
      review_notes: toText(input.notes) || null,
      approved_by_user_id: context.userId,
      approved_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", moduleState.connectionId)
    .eq("id", input.importId);
  if (error) throw error;

  await supabase
    .from("integration_webhook_events")
    .update({
      processing_status: "ignored",
      processed_at: new Date().toISOString(),
      error_message: input.action === "reject" ? "Rejected during review." : "Ignored during review."
    })
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", moduleState.connectionId)
    .eq("id", toText(item.webhook_event_id));

  await writeReviewAction({
    organizationId: context.organizationId,
    connectionId: moduleState.connectionId,
    transactionImportId: input.importId,
    actionType: input.action,
    performedByUserId: context.userId,
    previousValues: {
      review_status: item.review_status,
      import_status: item.import_status
    },
    newValues: {
      review_status: reviewStatus,
      import_status: "ignored"
    },
    notes: input.notes
  });

  return { ok: true };
}

export async function bulkApproveGivingFuelReviewItems(input: {
  importIds: string[];
}) {
  const context = await requireStaffPermission("can_edit_donations");
  const moduleState = await getGivingFuelModuleStateForCurrentUser();
  if (!moduleState.allowModuleAccess || !moduleState.connectionId) {
    throw new Error("GivingFuel module is not available.");
  }
  const supabase = await createIntegrationClient();
  const connection = await getWebhookConnectionForOrganization(context.organizationId);
  const config = connection?.configuration ?? {};
  const donorThreshold = Number(config.bulkApprovalDonorConfidenceThreshold ?? 98);
  const campaignThreshold = Number(config.bulkApprovalCampaignConfidenceThreshold ?? 100);

  const { data, error } = await supabase
    .from("integration_transaction_imports")
    .select("id, donor_match_confidence, campaign_match_confidence, matched_donor_id, matched_campaign_id, review_status")
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", moduleState.connectionId)
    .in("id", input.importIds);
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  let approved = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    const id = toText(row.id);
    const donorConfidence = Number(row.donor_match_confidence ?? 0);
    const campaignConfidence = Number(row.campaign_match_confidence ?? 0);
    if (
      toText(row.review_status) !== "pending_review" ||
      !toText(row.matched_donor_id) ||
      !toText(row.matched_campaign_id) ||
      donorConfidence < donorThreshold ||
      campaignConfidence < campaignThreshold
    ) {
      skipped.push(id);
      continue;
    }
    await approveGivingFuelReviewItem({ importId: id });
    approved += 1;
  }

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "givingfuel_bulk_approve",
    targetEntityType: "integration_transaction_imports",
    targetEntityId: null,
    metadata: {
      totalRequested: input.importIds.length,
      approved,
      skipped,
      donorThreshold,
      campaignThreshold
    }
  });

  return { approved, skipped };
}

export async function reprocessGivingFuelReviewItem(input: { importId: string }) {
  const context = await requireStaffPermission("can_edit_donations");
  const moduleState = await getGivingFuelModuleStateForCurrentUser();
  if (!moduleState.allowModuleAccess || !moduleState.connectionId) {
    throw new Error("GivingFuel module is not available.");
  }

  const supabase = await createIntegrationClient();
  const { data: item, error } = await supabase
    .from("integration_transaction_imports")
    .select("id, webhook_event_id")
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", moduleState.connectionId)
    .eq("id", input.importId)
    .maybeSingle();
  if (error) throw error;
  if (!item) throw new Error("Review item not found.");

  const { data: event, error: eventError } = await supabase
    .from("integration_webhook_events")
    .select("integration_connection_id, raw_payload_json")
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", moduleState.connectionId)
    .eq("id", toText(item.webhook_event_id))
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) throw new Error("Webhook event not found.");

  const connection = await getWebhookConnectionForOrganization(context.organizationId);
  if (!connection) throw new Error("GivingFuel webhook connection is not configured.");
  const connectionConfig = connection.configuration ?? {};
  const secretHeaderName = toText(connectionConfig.secretHeaderName) || "x-givingfuel-secret";
  const secret = toText(connectionConfig.encryptedWebhookSecret)
    ? decryptIntegrationSecret(toText(connectionConfig.encryptedWebhookSecret))
    : "";
  const body = JSON.stringify(event.raw_payload_json ?? {});
  const result = await processGivingFuelWebhookRequest({
    connectionId: toText(event.integration_connection_id),
    headers: new Headers(secret ? { [secretHeaderName]: secret } : {}),
    rawBody: body
  });

  await writeReviewAction({
    organizationId: context.organizationId,
    connectionId: moduleState.connectionId,
    transactionImportId: input.importId,
    actionType: "reprocess",
    performedByUserId: context.userId,
    previousValues: {},
    newValues: {
      webhookResult: result.body
    },
    notes: "Manual reprocess requested."
  });

  return { ok: true, result: result.body };
}

export async function getGivingFuelAdminConfiguration() {
  const context = await requireIntegrationManagerRole();
  const supabase = await createIntegrationClient();
  const connection = await getWebhookConnectionForOrganization(context.organizationId);
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("organization_id", context.organizationId)
    .order("name", { ascending: true });
  if (campaignsError) throw campaignsError;
  const { data: mappings, error: mappingsError } = await supabase
    .from("givingfuel_campaign_mappings")
    .select("id, external_page_id, external_page_key, external_page_name, crm_campaign_id, is_active, notes, created_at, updated_at")
    .eq("organization_id", context.organizationId)
    .order("updated_at", { ascending: false });
  if (mappingsError) throw mappingsError;

  return {
    connection,
    campaigns: campaigns ?? [],
    mappings: mappings ?? []
  };
}

export async function getGivingFuelAdminWebhookLog(limit = 10) {
  const context = await requireIntegrationManagerRole();
  const connection = await getWebhookConnectionForOrganization(context.organizationId);
  if (!connection?.id) {
    return { rows: [] as Array<Record<string, unknown>> };
  }

  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 250);
  const supabase = await createIntegrationClient();
  const { data, error } = await supabase
    .from("integration_webhook_events")
    .select(
      "id, received_at, processed_at, provider_event_id, event_type, processing_status, error_message, created_transaction_id"
    )
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", connection.id)
    .order("received_at", { ascending: false })
    .limit(boundedLimit);
  if (error) throw error;
  return { rows: data ?? [] };
}

export async function updateGivingFuelAdminConfiguration(input: {
  isEnabled?: boolean;
  allowModuleAccess?: boolean;
  webhookSecret?: string;
  settings?: Record<string, unknown>;
}) {
  const context = await requireIntegrationManagerRole();
  const supabase = await createIntegrationClient();
  const connection = await getWebhookConnectionForOrganization(context.organizationId);
  if (!connection?.id) {
    throw new Error("GivingFuel Webhook integration connection is not initialized yet.");
  }
  const configuration = {
    ...(connection.configuration ?? {}),
    ...(input.settings ?? {})
  } as Record<string, unknown>;
  if (typeof input.webhookSecret === "string") {
    const secret = input.webhookSecret.trim();
    if (secret) {
      configuration.encryptedWebhookSecret = encryptIntegrationSecret(secret);
      configuration.webhookSecretConfigured = true;
    } else {
      delete configuration.encryptedWebhookSecret;
      configuration.webhookSecretConfigured = false;
    }
  }

  const { error } = await supabase
    .from("integration_connections")
    .update({
      is_enabled: input.isEnabled ?? connection.isEnabled,
      allow_module_access: input.allowModuleAccess ?? connection.allowModuleAccess,
      configuration_json: configuration,
      sync_settings_json: {
        ...(connection.syncSettings ?? {}),
        webhookProcessingEnabled: input.isEnabled ?? connection.isEnabled
      },
      updated_by: context.userId
    })
    .eq("organization_id", context.organizationId)
    .eq("id", connection.id);
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "givingfuel_admin_configuration_updated",
    targetEntityType: "integration_connections",
    targetEntityId: connection.id,
    metadata: {
      isEnabled: input.isEnabled,
      allowModuleAccess: input.allowModuleAccess
    }
  });

  return getGivingFuelAdminConfiguration();
}

export async function upsertGivingFuelCampaignMapping(input: {
  mappingId?: string | null;
  externalPageId: string;
  externalPageKey?: string | null;
  externalPageName?: string | null;
  crmCampaignId: string;
  isActive?: boolean;
  notes?: string | null;
}) {
  const context = await requireIntegrationManagerRole();
  const connection = await getWebhookConnectionForOrganization(context.organizationId);
  if (!connection?.id) {
    throw new Error("GivingFuel Webhook connection is not configured.");
  }

  const supabase = await createIntegrationClient();
  const payload = {
    organization_id: context.organizationId,
    integration_connection_id: connection.id,
    external_page_id: toText(input.externalPageId),
    external_page_key: toText(input.externalPageKey) || null,
    external_page_name: toText(input.externalPageName) || null,
    crm_campaign_id: toText(input.crmCampaignId),
    is_active: input.isActive !== false,
    notes: toText(input.notes) || null,
    updated_by: context.userId,
    ...(input.mappingId ? {} : { created_by: context.userId })
  };

  const query = input.mappingId
    ? supabase
        .from("givingfuel_campaign_mappings")
        .update(payload)
        .eq("organization_id", context.organizationId)
        .eq("integration_connection_id", connection.id)
        .eq("id", input.mappingId)
    : supabase.from("givingfuel_campaign_mappings").insert(payload);
  const { error } = await query;
  if (error) throw error;
  return getGivingFuelAdminConfiguration();
}

export async function deleteGivingFuelCampaignMapping(mappingId: string) {
  const context = await requireIntegrationManagerRole();
  const connection = await getWebhookConnectionForOrganization(context.organizationId);
  if (!connection?.id) {
    throw new Error("GivingFuel Webhook connection is not configured.");
  }
  const supabase = await createIntegrationClient();
  const { error } = await supabase
    .from("givingfuel_campaign_mappings")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", connection.id)
    .eq("id", mappingId);
  if (error) throw error;
  return { ok: true };
}
