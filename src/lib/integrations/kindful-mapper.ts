import crypto from "crypto";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string) {
  return value.replace(/\D+/g, "");
}

export function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function valueByPath(record: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return record[path];
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = record;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = valueByPath(record, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = valueByPath(record, key);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function readDateTime(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = valueByPath(record, key);
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
  }
  return null;
}

export function readDate(record: Record<string, unknown>, keys: string[]) {
  const dateTime = readDateTime(record, keys);
  if (!dateTime) return null;
  return dateTime.slice(0, 10);
}

export function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function objectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>>;
}

export function buildPayloadHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
}

export function extractKindfulContactIds(record: Record<string, unknown>) {
  const primaryId = readString(record, ["id", "contact.id", "contact_id", "external_id"]);
  const externalId = readString(record, ["external_id", "contact.external_id"]);
  const ids = new Set<string>();
  if (primaryId) ids.add(primaryId);
  if (externalId) ids.add(externalId);
  return Array.from(ids);
}

export function extractKindfulTransactionIds(record: Record<string, unknown>) {
  const primaryId = readString(record, ["id", "transaction.id", "transaction_id", "external_id"]);
  const externalId = readString(record, ["external_id", "transaction.external_id"]);
  const gatewayId = readString(record, [
    "gateway_transaction_id",
    "gateway_transaction_reference",
    "gateway_reference",
    "reference_number"
  ]);
  const ids = new Set<string>();
  if (primaryId) ids.add(primaryId);
  if (externalId) ids.add(externalId);
  if (gatewayId) ids.add(gatewayId);
  return Array.from(ids);
}

export function extractGroups(record: Record<string, unknown>) {
  const groups = new Set<string>();
  const candidates = [
    valueByPath(record, "groups"),
    valueByPath(record, "contact.groups"),
    valueByPath(record, "segments"),
    valueByPath(record, "contact.segments")
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === "string" && entry.trim()) {
          groups.add(entry.trim());
          continue;
        }
        if (entry && typeof entry === "object") {
          const name = readString(entry as Record<string, unknown>, ["name", "label", "title"]);
          if (name) groups.add(name);
        }
      }
    }
  }
  return Array.from(groups);
}

export function extractCampaign(record: Record<string, unknown>) {
  const campaignName = readString(record, [
    "campaign.name",
    "transaction.campaign.name",
    "campaign",
    "campaign_name"
  ]);
  const campaignId = readString(record, ["campaign.id", "transaction.campaign.id", "campaign_id"]);
  return {
    campaignName,
    campaignId
  };
}

export function extractFund(record: Record<string, unknown>) {
  const fundName = readString(record, ["fund.name", "transaction.fund.name", "fund", "fund_name"]);
  const fundId = readString(record, ["fund.id", "transaction.fund.id", "fund_id"]);
  return {
    fundName,
    fundId
  };
}
