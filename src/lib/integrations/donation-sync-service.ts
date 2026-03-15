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
};

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
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
    const value = record[key];
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
    const incremental = Boolean(syncSettings.incrementalSyncEnabled ?? true);
    const initialStart = (syncSettings.initialImportStartDate as string | null | undefined) ?? null;
    const updatedSince = incremental
      ? ((syncSettings.lastSuccessfulSyncDate as string | null | undefined) ?? initialStart)
      : null;

    let cursor: string | null =
      (syncSettings.donationsCursor as string | null | undefined) ?? null;
    let processed = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;

    do {
      const page = await input.apiClient.getTransactions({
        cursor,
        updatedSince,
        pageSize: 100
      });

      for (const record of page.records) {
        processed += 1;
        const externalTransactionId = readString(record, [
          "id",
          "transaction_id",
          "external_transaction_id"
        ]);
        const externalContactId = readString(record, ["contact_id", "donor_id", "external_contact_id"]);
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
          let resolvedContactId: string | null = null;
          if (externalContactId) {
            const { data: contactRef } = await supabase
              .from("contact_external_references")
              .select("contact_id")
              .eq("organization_id", input.organizationId)
              .eq("source_system", "webconnex")
              .eq("external_record_id", externalContactId)
              .maybeSingle();
            resolvedContactId = (contactRef?.contact_id as string | undefined) ?? null;
          }

          if (!resolvedContactId && Boolean(syncSettings.fallbackContactMatch === "email_if_configured")) {
            const donorEmail = readString(record, ["email", "donor_email", "contact_email"]);
            if (donorEmail) {
              const { data: contactByEmail } = await supabase
                .from("contacts")
                .select("id")
                .eq("organization_id", input.organizationId)
                .eq("email", donorEmail)
                .maybeSingle();
              resolvedContactId = (contactByEmail?.id as string | undefined) ?? null;
            }
          }

          if (!resolvedContactId) {
            failed += 1;
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

          const amount = readNumber(record, ["amount", "total", "value"]);
          const donationDate = readDate(record, ["donation_date", "transaction_date", "date"]);
          const paymentMethod = readString(record, ["payment_method", "payment_type", "method"]);
          const campaign = readString(record, ["campaign", "fund", "designation"]);
          const status = readString(record, ["status"]) || "posted";
          const notes = readString(record, ["notes", "memo", "comment"]);

          const { data: existingRef } = await supabase
            .from("donation_external_references")
            .select("id, donation_id")
            .eq("organization_id", input.organizationId)
            .eq("source_system", "webconnex")
            .eq("external_record_id", externalTransactionId)
            .maybeSingle();

          let donationId = (existingRef?.donation_id as string | undefined) ?? null;
          let actionTaken = "updated";

          if (donationId) {
            const { error: updateError } = await supabase
              .from("donations")
              .update({
                contact_id: resolvedContactId,
                amount,
                donation_date: donationDate,
                status,
                payment_method: paymentMethod || null,
                payment_type: normalizePaymentType(paymentMethod),
                source: "integration_webconnex",
                source_platform: "webconnex",
                external_transaction_id: externalTransactionId,
                campaign: campaign || null,
                notes: notes || null,
                updated_at: new Date().toISOString()
              })
              .eq("organization_id", input.organizationId)
              .eq("id", donationId);
            if (updateError) throw updateError;
            updated += 1;
          } else {
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
                campaign: campaign || null,
                notes: notes || null
              })
              .select("id")
              .single();
            if (createError) throw createError;
            donationId = createdDonation.id as string;
            created += 1;
            actionTaken = "created";
          }

          const { error: refError } = await supabase.from("donation_external_references").upsert(
            {
              organization_id: input.organizationId,
              donation_id: donationId,
              source_system: "webconnex",
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
            actionTaken,
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

      cursor = page.nextCursor;
    } while (cursor);

    return {
      processed,
      created,
      updated,
      failed,
      cursor: null
    };
  }
}
