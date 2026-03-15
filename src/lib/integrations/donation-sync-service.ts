import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationSyncJob } from "@/lib/integrations/types";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import { WebconnexApiClient } from "@/lib/integrations/webconnex-api-client";

type DonationSyncResult = {
  processed: number;
  created: number;
  updated: number;
  failed: number;
  cursor: string | null;
  skippedDuplicates: number;
  skippedUnmappedPages: number;
  missingContactMatches: number;
  unmappedPageValues: string[];
};

type PageMappingRow = {
  id: string;
  external_page_value: string;
  mapped_campaign_id: string | null;
  mapped_sub_campaign_id: string | null;
  status: string;
};

type DonationFieldMapping = {
  externalTransactionId?: unknown;
  externalContactId?: unknown;
  pageValue?: unknown;
  amount?: unknown;
  donationDate?: unknown;
  paymentMethod?: unknown;
  status?: unknown;
  campaignName?: unknown;
  notes?: unknown;
  isRecurring?: unknown;
};

function valueAtPath(record: Record<string, unknown>, path: string) {
  if (!path.includes(".")) {
    return record[path];
  }
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  let current: unknown = record;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const rawKey of keys) {
    const key = rawKey.trim();
    if (!key) continue;
    const value = valueAtPath(record, key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function readDate(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = valueAtPath(record, key);
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function normalizePaymentType(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("check")) return "Check";
  if (normalized.includes("card") || normalized.includes("credit")) return "Card";
  return "Cash";
}

function normalizeDonationStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "refunded") return "refunded";
  if (normalized === "failed") return "failed";
  return "posted";
}

function normalizePageValue(value: string) {
  return value.trim();
}

function toStringCandidates(value: unknown, fallback: string[]) {
  if (typeof value === "string" && value.trim()) return [value.trim(), ...fallback];
  if (Array.isArray(value)) {
    const mapped = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
    if (mapped.length > 0) return [...mapped, ...fallback];
  }
  return fallback;
}

async function resolveExistingPageMappings(input: {
  organizationId: string;
  connectionId: string;
}) {
  const supabase = await createIntegrationClient();
  const { data, error } = await supabase
    .from("integration_donation_page_mappings")
    .select("id, external_page_value, mapped_campaign_id, mapped_sub_campaign_id, status")
    .eq("organization_id", input.organizationId)
    .eq("integration_connection_id", input.connectionId);
  if (error) throw error;
  const rows = (data ?? []) as PageMappingRow[];
  const map = new Map<string, PageMappingRow>();
  for (const row of rows) {
    map.set(normalizePageValue(String(row.external_page_value ?? "")), row);
  }
  return map;
}

export class DonationSyncService {
  async run(input: {
    organizationId: string;
    connection: IntegrationConnection;
    job: IntegrationSyncJob;
    apiClient: WebconnexApiClient;
    logService: IntegrationLogService;
  }): Promise<DonationSyncResult> {
    const supabase = await createIntegrationClient();
    const syncSettings = input.connection.sync_settings_json ?? {};
    const mapping = ((input.connection.field_mapping_json ?? {}) as { donations?: DonationFieldMapping })
      .donations ?? {};
    let cursor: string | null =
      (syncSettings.donationsCursor as string | null | undefined) ?? null;
    let processed = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    let skippedDuplicates = 0;
    let skippedUnmappedPages = 0;
    let missingContactMatches = 0;
    let hasMore = true;
    let guard = 0;
    let pagesProcessed = 0;
    const unmappedPageValues = new Set<string>();
    const pageMappings = await resolveExistingPageMappings({
      organizationId: input.organizationId,
      connectionId: input.connection.id
    });
    const contactResolutionCache = new Map<string, string | null>();

    async function ensureDetectedPageRow(pageValue: string) {
      const normalized = normalizePageValue(pageValue);
      const now = new Date().toISOString();
      const cached = pageMappings.get(normalized);
      if (cached) {
        const { error: updateError } = await supabase
          .from("integration_donation_page_mappings")
          .update({
            last_detected_at: now
          })
          .eq("organization_id", input.organizationId)
          .eq("integration_connection_id", input.connection.id)
          .eq("id", cached.id);
        if (updateError) throw updateError;
        return cached;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("integration_donation_page_mappings")
        .insert({
          organization_id: input.organizationId,
          integration_connection_id: input.connection.id,
          external_page_value: normalized,
          status: "unmapped",
          first_detected_at: now,
          last_detected_at: now,
          created_by: input.job.triggered_by ?? null,
          updated_by: input.job.triggered_by ?? null
        })
        .select("id, external_page_value, mapped_campaign_id, mapped_sub_campaign_id, status")
        .single();
      if (insertError) throw insertError;
      const row = inserted as PageMappingRow;
      pageMappings.set(normalized, row);
      return row;
    }

    async function resolveContactByExternalId(externalContactId: string) {
      const normalized = externalContactId.trim();
      if (contactResolutionCache.has(normalized)) {
        return contactResolutionCache.get(normalized) ?? null;
      }
      const { data: contactRef, error } = await supabase
        .from("contact_external_references")
        .select("contact_id")
        .eq("organization_id", input.organizationId)
        .in("source_system", ["givingfuel", "webconnex"])
        .eq("external_record_id", normalized)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const resolved = (contactRef?.contact_id as string | undefined) ?? null;
      contactResolutionCache.set(normalized, resolved);
      return resolved;
    }

    while (hasMore && guard < 10000) {
      guard += 1;
      pagesProcessed += 1;
      const page = await input.apiClient.getTransactions({
        startingAfter: cursor,
        limit: 100
      });
      hasMore = page.hasMore;

      for (const record of page.records) {
        processed += 1;
        const externalTransactionId = readString(
          record,
          toStringCandidates(mapping.externalTransactionId, [
            "id",
            "transaction_id",
            "transactionId",
            "external_transaction_id"
          ])
        );
        const externalContactId = readString(
          record,
          toStringCandidates(mapping.externalContactId, [
            "contact_id",
            "customer_id",
            "customer.id",
            "customerId",
            "donor_id",
            "external_contact_id"
          ])
        );
        const externalPageValue = readString(
          record,
          toStringCandidates(mapping.pageValue, [
            "page",
            "page_name",
            "pageName",
            "form_name",
            "fund",
            "campaign"
          ])
        );
        if (!externalTransactionId) {
          failed += 1;
          await input.logService.enqueueError({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "donation",
            payload: record,
            errorMessage: "Missing external transaction id."
          });
          continue;
        }

        try {
          const { data: existingDonation, error: existingDonationError } = await supabase
            .from("donations")
            .select("id")
            .eq("organization_id", input.organizationId)
            .in("source_platform", ["webconnex", "givingfuel"])
            .eq("external_transaction_id", externalTransactionId)
            .maybeSingle();
          if (existingDonationError) throw existingDonationError;

          if (existingDonation?.id) {
            skippedDuplicates += 1;
            await input.logService.addSyncLog({
              organizationId: input.organizationId,
              integrationConnectionId: input.connection.id,
              jobId: input.job.id,
              entityType: "donation",
              sourceRecordId: externalTransactionId,
              crmRecordId: String(existingDonation.id),
              actionTaken: "skipped_duplicate",
              status: "processed",
              message: "Skipped duplicate donation transaction id."
            });
            continue;
          }

          const mappingRow = externalPageValue ? await ensureDetectedPageRow(externalPageValue) : null;
          if (!mappingRow?.mapped_campaign_id) {
            failed += 1;
            skippedUnmappedPages += 1;
            if (externalPageValue) {
              unmappedPageValues.add(externalPageValue);
            }
            await input.logService.enqueueError({
              organizationId: input.organizationId,
              integrationConnectionId: input.connection.id,
              jobId: input.job.id,
              entityType: "donation",
              sourceRecordId: externalTransactionId,
              payload: record,
              errorMessage: externalPageValue
                ? `Donation page "${externalPageValue}" is not mapped to a campaign.`
                : "Donation page value is missing and cannot be mapped to a campaign."
            });
            continue;
          }

          if (!externalContactId) {
            failed += 1;
            missingContactMatches += 1;
            await input.logService.enqueueError({
              organizationId: input.organizationId,
              integrationConnectionId: input.connection.id,
              jobId: input.job.id,
              entityType: "donation",
              sourceRecordId: externalTransactionId,
              payload: record,
              errorMessage:
                "Missing WebConnex/GivingFuel contact ID on donation. Donation moved to review queue."
            });
            continue;
          }

          const resolvedContactId = await resolveContactByExternalId(externalContactId);

          if (!resolvedContactId) {
            failed += 1;
            missingContactMatches += 1;
            await input.logService.enqueueError({
              organizationId: input.organizationId,
              integrationConnectionId: input.connection.id,
              jobId: input.job.id,
              entityType: "donation",
              sourceRecordId: externalTransactionId,
              payload: record,
              errorMessage:
                "Unable to resolve donation contact by Webconnex external contact ID (or configured fallback)."
            });
            continue;
          }

          const amount = readNumber(
            record,
            toStringCandidates(mapping.amount, ["amount", "total", "value"])
          );
          const donationDate = readDate(
            record,
            toStringCandidates(mapping.donationDate, [
              "donation_date",
              "transaction_date",
              "date",
              "created_at"
            ])
          );
          const paymentMethod = readString(
            record,
            toStringCandidates(mapping.paymentMethod, ["payment_method", "payment_type", "method"])
          );
          const campaign = readString(
            record,
            toStringCandidates(mapping.campaignName, ["campaign", "fund", "designation"])
          );
          const status = normalizeDonationStatus(
            readString(record, toStringCandidates(mapping.status, ["status"])) || "posted"
          );
          const notes = readString(
            record,
            toStringCandidates(mapping.notes, ["notes", "memo", "comment"])
          );
          const recurringRaw = readString(
            record,
            toStringCandidates(mapping.isRecurring, ["is_recurring", "recurring"])
          );
          const isRecurring = ["1", "true", "yes", "y"].includes(recurringRaw.toLowerCase());

          const { data: createdDonation, error: createError } = await supabase
            .from("donations")
            .insert({
              organization_id: input.organizationId,
              contact_id: resolvedContactId,
              amount,
              donation_date: donationDate,
              status,
              payment_method: paymentMethod || null,
              payment_type: normalizePaymentType(paymentMethod),
              source: "integration_webconnex",
              source_platform: "webconnex",
              external_transaction_id: externalTransactionId,
              transaction_id: externalTransactionId,
              campaign: campaign || externalPageValue || null,
              campaign_id: mappingRow.mapped_campaign_id,
              sub_campaign_id: mappingRow.mapped_sub_campaign_id,
              notes: notes || null,
              memo: notes || null,
              is_recurring: isRecurring
            })
            .select("id")
            .single();
          if (createError) throw createError;
          const donationId = createdDonation.id as string;
          created += 1;

          const { error: refError } = await supabase.from("donation_external_references").upsert(
            {
              organization_id: input.organizationId,
              donation_id: donationId,
              source_system: "givingfuel",
              external_record_id: externalTransactionId,
              external_record_type: "transaction",
              external_contact_id: externalContactId || null,
              last_synced_date: new Date().toISOString()
            },
            { onConflict: "organization_id,source_system,external_record_id" }
          );
          if (refError) throw refError;

          await input.logService.addSyncLog({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "donation",
            sourceRecordId: externalTransactionId,
            crmRecordId: donationId,
            actionTaken: "created",
            status: "processed",
            message: "Donation synchronized."
          });
        } catch (error) {
          failed += 1;
          await input.logService.enqueueError({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "donation",
            sourceRecordId: externalTransactionId,
            payload: record,
            errorMessage: error instanceof Error ? error.message : "Donation sync failed."
          });
        }
      }

      const nextCursor = page.nextCursor;
      const cursorUnchanged = Boolean(nextCursor && nextCursor === cursor);
      cursor = nextCursor;
      if (!hasMore || !cursor || cursorUnchanged) {
        hasMore = false;
      }

      if (pagesProcessed % 5 === 0 && cursor) {
        const mergedSettings = {
          ...(input.connection.sync_settings_json ?? {}),
          donationsCursor: cursor
        };
        await supabase
          .from("integration_connections")
          .update({
            sync_settings_json: mergedSettings
          })
          .eq("organization_id", input.organizationId)
          .eq("id", input.connection.id);
      }
    }

    return {
      processed,
      created,
      updated,
      failed,
      cursor,
      skippedDuplicates,
      skippedUnmappedPages,
      missingContactMatches,
      unmappedPageValues: Array.from(unmappedPageValues).sort((a, b) => a.localeCompare(b))
    };
  }
}
