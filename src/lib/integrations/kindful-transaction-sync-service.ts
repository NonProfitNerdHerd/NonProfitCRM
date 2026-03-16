import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationSyncJob } from "@/lib/integrations/types";
import { KindfulApiClient } from "@/lib/integrations/kindful-api-client";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import {
  buildPayloadHash,
  extractCampaign,
  extractFund,
  extractKindfulTransactionIds,
  readDate,
  readDateTime,
  readNumber,
  readString,
  valueByPath
} from "@/lib/integrations/kindful-mapper";
import {
  archiveRawPayload,
  enqueueDeadLetter,
  enqueueReview,
  findLikelyContactMatch,
  isExternalIdSchemaMissingError,
  upsertCheckpoint
} from "@/lib/integrations/kindful-sync-support";

type KindfulTransactionSyncResult = {
  retrieved: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  reviewQueued: number;
  pagesProcessed: number;
  queryToken: string | null;
  pagingComplete: boolean;
  totalExpected: number | null;
  completionNote: string;
};

function normalizeDonationStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("pending")) return "pending";
  if (normalized.includes("refund")) return "refunded";
  if (normalized.includes("fail")) return "failed";
  return "posted";
}

function normalizePaymentType(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("check")) return "Check";
  if (normalized.includes("card") || normalized.includes("credit")) return "Card";
  if (normalized.includes("ach") || normalized.includes("bank")) return "Bank";
  return "Cash";
}

export class KindfulTransactionSyncService {
  private async resolveContactId(input: {
    supabase: Awaited<ReturnType<typeof createIntegrationClient>>;
    organizationId: string;
    record: Record<string, unknown>;
  }) {
    const externalContactId = readString(input.record, [
      "contact_id",
      "contact.id",
      "contact.external_id",
      "donor_id",
      "donor.id"
    ]);
    if (externalContactId) {
      const rpc = await input.supabase.rpc("resolve_contact_by_external_id", {
        org_id: input.organizationId,
        source: "kindful",
        external: externalContactId
      });
      if (!rpc.error && rpc.data) return String(rpc.data);
      if (rpc.error && !isExternalIdSchemaMissingError(rpc.error)) throw rpc.error;

      const legacyRef = await input.supabase
        .from("contact_external_references")
        .select("contact_id")
        .eq("organization_id", input.organizationId)
        .eq("source_system", "kindful")
        .eq("external_record_id", externalContactId)
        .maybeSingle();
      if (legacyRef.error) throw legacyRef.error;
      if (legacyRef.data?.contact_id) return String(legacyRef.data.contact_id);
    }

    const contactPayload = valueByPath(input.record, "contact");
    if (contactPayload && typeof contactPayload === "object" && !Array.isArray(contactPayload)) {
      const likely = await findLikelyContactMatch({
        supabase: input.supabase,
        organizationId: input.organizationId,
        source: contactPayload as Record<string, unknown>
      });
      if (!likely.shouldQueueReview && likely.matchContactId) return likely.matchContactId;
    }
    return null;
  }

  private async resolveDonationByExternalIds(input: {
    supabase: Awaited<ReturnType<typeof createIntegrationClient>>;
    organizationId: string;
    externalIds: string[];
  }) {
    for (const externalId of input.externalIds) {
      const rpc = await input.supabase.rpc("resolve_transaction_by_external_id", {
        org_id: input.organizationId,
        source: "kindful",
        external: externalId
      });
      if (!rpc.error && rpc.data) return String(rpc.data);
      if (rpc.error && !isExternalIdSchemaMissingError(rpc.error)) throw rpc.error;

      const legacy = await input.supabase
        .from("donation_external_references")
        .select("donation_id")
        .eq("organization_id", input.organizationId)
        .eq("source_system", "kindful")
        .eq("external_record_id", externalId)
        .maybeSingle();
      if (legacy.error) throw legacy.error;
      if (legacy.data?.donation_id) return String(legacy.data.donation_id);
    }
    return null;
  }

  private async resolveCampaignId(input: {
    supabase: Awaited<ReturnType<typeof createIntegrationClient>>;
    organizationId: string;
    campaignName: string;
    campaignExternalId: string;
  }) {
    let campaignId: string | null = null;
    if (input.campaignExternalId) {
      const mapped = await input.supabase
        .from("campaign_external_ids")
        .select("campaign_id")
        .eq("organization_id", input.organizationId)
        .eq("source_system", "kindful")
        .eq("external_id", input.campaignExternalId)
        .maybeSingle();
      if (!mapped.error && mapped.data?.campaign_id) {
        campaignId = String(mapped.data.campaign_id);
      }
    }

    if (!campaignId && input.campaignName) {
      const existing = await input.supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("name", input.campaignName)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.id) campaignId = String(existing.data.id);
    }

    if (!campaignId && input.campaignName) {
      const inserted = await input.supabase
        .from("campaigns")
        .insert({
          organization_id: input.organizationId,
          name: input.campaignName,
          description: "Created by Kindful transaction sync",
          status: "Active"
        })
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      campaignId = String(inserted.data.id);
    }

    if (campaignId && input.campaignExternalId) {
      const mapping = await input.supabase.from("campaign_external_ids").upsert(
        {
          organization_id: input.organizationId,
          campaign_id: campaignId,
          source_system: "kindful",
          external_id: input.campaignExternalId,
          external_type: "campaign",
          is_active: true,
          last_seen_at: new Date().toISOString()
        },
        { onConflict: "organization_id,source_system,external_id" }
      );
      if (mapping.error && !String(mapping.error.message ?? "").includes("campaign_external_ids")) {
        throw mapping.error;
      }
    }

    return campaignId;
  }

  async run(input: {
    organizationId: string;
    connection: IntegrationConnection;
    job: IntegrationSyncJob;
    apiClient: KindfulApiClient;
    logService: IntegrationLogService;
  }): Promise<KindfulTransactionSyncResult> {
    const supabase = await createIntegrationClient();
    const syncSettings = { ...(input.connection.sync_settings_json ?? {}) } as Record<string, unknown>;

    const checkpoints = await supabase
      .from("integration_sync_checkpoints")
      .select("checkpoint_key, checkpoint_value")
      .eq("organization_id", input.organizationId)
      .eq("integration_connection_id", input.connection.id)
      .eq("scope", "transactions");
    if (
      checkpoints.error &&
      !String(checkpoints.error.message ?? "").includes("integration_sync_checkpoints")
    ) {
      throw checkpoints.error;
    }
    const checkpointMap = new Map<string, Record<string, unknown>>();
    for (const row of (checkpoints.data ?? []) as Array<{
      checkpoint_key: string;
      checkpoint_value: Record<string, unknown>;
    }>) {
      checkpointMap.set(String(row.checkpoint_key), row.checkpoint_value ?? {});
    }
    let queryToken =
      (checkpointMap.get("query_token")?.value as string | undefined) ??
      (syncSettings.kindfulTransactionsQueryToken as string | undefined) ??
      null;
    let mode: "backfill" | "incremental" =
      (syncSettings.kindfulTransactionsMode as "backfill" | "incremental" | undefined) ??
      "incremental";
    if (!queryToken && !syncSettings.lastSuccessfulSyncDate) {
      mode = "backfill";
    }

    let retrieved = 0;
    let processed = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    let reviewQueued = 0;
    let pagesProcessed = 0;
    let pagingComplete = true;
    let completionNote = "Paging complete.";
    let totalExpected: number | null = null;
    let guard = 0;

    const baseQuery =
      mode === "backfill"
        ? (["linked", "changed"] as Array<"linked" | "changed">)
        : (["changed"] as Array<"changed">);

    while (guard < 5000) {
      guard += 1;
      let page;
      try {
        page = await input.apiClient.queryTransactions({
          query: queryToken ? undefined : baseQuery,
          queryToken,
          perPage: Number(syncSettings.pageSize ?? 50)
        });
      } catch (error) {
        failed += 1;
        pagingComplete = false;
        completionNote = "Kindful transactions sync stopped after query failure.";
        await input.logService.enqueueError({
          organizationId: input.organizationId,
          integrationConnectionId: input.connection.id,
          jobId: input.job.id,
          entityType: "kindful_transactions_query",
          sourceRecordId: queryToken,
          payload: { queryToken, mode },
          errorMessage:
            error instanceof Error ? error.message : "Kindful transactions query failed."
        });
        await enqueueDeadLetter({
          supabase,
          organizationId: input.organizationId,
          connectionId: input.connection.id,
          syncJobId: input.job.id,
          entityType: "kindful_transactions_query",
          sourceRecordId: queryToken,
          payload: { queryToken, mode },
          errorMessage:
            error instanceof Error ? error.message : "Kindful transactions query failed.",
          retryable: true
        });
        break;
      }

      pagesProcessed += 1;
      retrieved += page.records.length;
      totalExpected = totalExpected ?? page.totalExpected;

      await input.logService.addSyncLog({
        organizationId: input.organizationId,
        integrationConnectionId: input.connection.id,
        jobId: input.job.id,
        entityType: "kindful_transactions_page",
        sourceRecordId: queryToken,
        status: "processed",
        message: `Kindful transactions page ${pagesProcessed}: ${page.records.length} records`,
        requestPayload: {
          mode,
          queryToken
        },
        responsePayload: {
          recordCount: page.records.length,
          nextQueryToken: page.nextQueryToken,
          hasMore: page.hasMore,
          totalExpected: page.totalExpected
        }
      });

      for (const record of page.records) {
        processed += 1;
        const payloadHash = buildPayloadHash(record);
        const externalIds = extractKindfulTransactionIds(record).filter(Boolean);
        const primaryExternalId = externalIds[0] ?? null;
        try {
          if (!primaryExternalId) {
            throw new Error("Kindful transaction missing external ID.");
          }

          let donationId =
            (await this.resolveDonationByExternalIds({
              supabase,
              organizationId: input.organizationId,
              externalIds
            })) ?? null;

          const amountInCents = readNumber(record, [
            "amount_in_cents",
            "transaction.amount_in_cents",
            "gross_amount_in_cents"
          ]);
          const amountDirect = readNumber(record, ["amount", "transaction.amount", "gross_amount"]);
          const amount =
            amountInCents !== null ? Number((amountInCents / 100).toFixed(2)) : amountDirect ?? 0;
          if (!Number.isFinite(amount) || amount < 0) {
            throw new Error("Kindful transaction amount is invalid.");
          }

          const donationDate =
            readDate(record, ["transaction_time", "created_at", "updated_at", "date"]) ??
            new Date().toISOString().slice(0, 10);
          const paymentMethod = readString(record, ["payment_method", "payment_type", "payment"]);
          const status = normalizeDonationStatus(readString(record, ["status"]) || "posted");
          const campaign = extractCampaign(record);
          const fund = extractFund(record);
          const campaignName = campaign.campaignName || fund.fundName || "General Campaign";
          const campaignId = await this.resolveCampaignId({
            supabase,
            organizationId: input.organizationId,
            campaignName,
            campaignExternalId: campaign.campaignId || ""
          });

          const contactId = await this.resolveContactId({
            supabase,
            organizationId: input.organizationId,
            record
          });

          if (!contactId && !donationId) {
            const contactPayload = valueByPath(record, "contact");
            const candidates =
              contactPayload && typeof contactPayload === "object" && !Array.isArray(contactPayload)
                ? [contactPayload as Record<string, unknown>]
                : [];
            await enqueueReview({
              supabase,
              organizationId: input.organizationId,
              connectionId: input.connection.id,
              syncJobId: input.job.id,
              entityType: "transaction",
              sourceRecordId: primaryExternalId,
              reason: "Transaction donor could not be resolved with high confidence.",
              confidenceScore: null,
              sourcePayload: record,
              candidateMatches: candidates
            });
            reviewQueued += 1;
            skipped += 1;
            await input.logService.addSyncLog({
              organizationId: input.organizationId,
              integrationConnectionId: input.connection.id,
              jobId: input.job.id,
              entityType: "transaction",
              sourceRecordId: primaryExternalId,
              actionTaken: "queued_for_review",
              status: "review",
              message: "Transaction queued for donor matching review."
            });
            continue;
          }

          if (!donationId && contactId) {
            const fuzzyMatch = await supabase
              .from("donations")
              .select("id")
              .eq("organization_id", input.organizationId)
              .eq("contact_id", contactId)
              .eq("amount", amount)
              .eq("donation_date", donationDate)
              .limit(2);
            if (fuzzyMatch.error) throw fuzzyMatch.error;
            const rows = fuzzyMatch.data ?? [];
            if (rows.length === 1) donationId = String(rows[0].id);
            if (rows.length > 1) {
              await enqueueReview({
                supabase,
                organizationId: input.organizationId,
                connectionId: input.connection.id,
                syncJobId: input.job.id,
                entityType: "transaction",
                sourceRecordId: primaryExternalId,
                reason: "Ambiguous transaction duplicate candidates.",
                confidenceScore: 65,
                sourcePayload: record,
                candidateMatches: rows as Array<Record<string, unknown>>
              });
              reviewQueued += 1;
              skipped += 1;
              continue;
            }
          }

          const notesParts = [
            readString(record, ["note", "memo", "description"]),
            readString(record, ["pledge_id", "transaction.pledge_id"])
              ? `pledge:${readString(record, ["pledge_id", "transaction.pledge_id"])}`
              : "",
            readString(record, ["soft_credit_contact_id", "transaction.soft_credit_contact_id"])
              ? `soft_credit_contact:${readString(record, [
                  "soft_credit_contact_id",
                  "transaction.soft_credit_contact_id"
                ])}`
              : ""
          ]
            .filter(Boolean)
            .join(" | ");

          if (donationId) {
            const updateResult = await supabase
              .from("donations")
              .update({
                contact_id: contactId ?? null,
                amount,
                donation_date: donationDate,
                status,
                payment_method: paymentMethod || null,
                payment_type: normalizePaymentType(paymentMethod || ""),
                source: "integration_kindful",
                source_platform: "kindful",
                external_transaction_id: primaryExternalId,
                campaign: campaignName || null,
                campaign_id: campaignId ?? null,
                fund: fund.fundName || null,
                notes: notesParts || null,
                imported_at: readDateTime(record, ["updated_at", "created_at"]) ?? new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq("organization_id", input.organizationId)
              .eq("id", donationId);
            if (updateResult.error) throw updateResult.error;
            updated += 1;
          } else {
            const insertResult = await supabase
              .from("donations")
              .insert({
                organization_id: input.organizationId,
                contact_id: contactId ?? null,
                amount,
                currency: readString(record, ["currency"]) || "USD",
                donation_date: donationDate,
                status,
                payment_method: paymentMethod || null,
                payment_type: normalizePaymentType(paymentMethod || ""),
                source: "integration_kindful",
                source_platform: "kindful",
                external_transaction_id: primaryExternalId,
                campaign: campaignName || null,
                campaign_id: campaignId ?? null,
                fund: fund.fundName || null,
                is_recurring: readString(record, ["is_recurring", "recurring"]).toLowerCase() === "true",
                notes: notesParts || null,
                imported_at: readDateTime(record, ["updated_at", "created_at"]) ?? new Date().toISOString()
              })
              .select("id")
              .single();
            if (insertResult.error) throw insertResult.error;
            donationId = String(insertResult.data.id);
            created += 1;
          }

          if (!donationId) {
            throw new Error("Transaction upsert failed to resolve donation id.");
          }

          for (const externalId of externalIds) {
            const txExt = await supabase.from("transaction_external_ids").upsert(
              {
                organization_id: input.organizationId,
                donation_id: donationId,
                source_system: "kindful",
                external_id: externalId,
                external_type: "transaction",
                raw_source_reference: {
                  transaction_id: primaryExternalId
                },
                last_seen_at: new Date().toISOString(),
                is_active: true
              },
              { onConflict: "organization_id,source_system,external_id" }
            );
            if (txExt.error && !String(txExt.error.message ?? "").includes("transaction_external_ids")) {
              throw txExt.error;
            }
          }

          const legacyRef = await supabase.from("donation_external_references").upsert(
            {
              organization_id: input.organizationId,
              donation_id: donationId,
              source_system: "kindful",
              external_record_id: primaryExternalId,
              external_record_type: "transaction",
              external_contact_id: readString(record, [
                "contact_id",
                "contact.id",
                "contact.external_id"
              ]),
              last_source_modified_date:
                readDateTime(record, ["updated_at", "created_at"]) ?? new Date().toISOString(),
              last_synced_date: new Date().toISOString()
            },
            { onConflict: "organization_id,source_system,external_record_id" }
          );
          if (legacyRef.error) throw legacyRef.error;

          await archiveRawPayload({
            supabase,
            organizationId: input.organizationId,
            connectionId: input.connection.id,
            syncJobId: input.job.id,
            sourceSystem: "kindful",
            entityType: "transaction",
            sourceRecordId: primaryExternalId,
            payload: record,
            payloadHash
          });

          await input.logService.addSyncLog({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "transaction",
            sourceRecordId: primaryExternalId,
            crmRecordId: donationId,
            actionTaken: created + updated > 0 ? "upserted" : "processed",
            status: "processed",
            message: `Kindful transaction ${donationId} synchronized.`
          });
        } catch (error) {
          failed += 1;
          await input.logService.enqueueError({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "transaction",
            sourceRecordId: primaryExternalId,
            payload: record,
            errorMessage: error instanceof Error ? error.message : "Kindful transaction sync failed."
          });
          await enqueueDeadLetter({
            supabase,
            organizationId: input.organizationId,
            connectionId: input.connection.id,
            syncJobId: input.job.id,
            entityType: "transaction",
            sourceRecordId: primaryExternalId,
            payload: record,
            errorMessage: error instanceof Error ? error.message : "Kindful transaction sync failed.",
            retryable: true
          });
        }
      }

      queryToken = page.nextQueryToken;
      await upsertCheckpoint({
        supabase,
        organizationId: input.organizationId,
        connectionId: input.connection.id,
        scope: "transactions",
        checkpointKey: "query_token",
        checkpointValue: {
          value: queryToken,
          mode,
          page: pagesProcessed
        },
        lastSuccessfulSyncDate: new Date().toISOString()
      });

      await input.logService.updateJobProgress({
        organizationId: input.organizationId,
        jobId: input.job.id,
        currentPage: pagesProcessed,
        currentCursor: queryToken,
        totalRecordsExpected: totalExpected,
        recordsRetrieved: retrieved,
        recordsProcessed: processed,
        recordsCreated: created,
        recordsUpdated: updated,
        recordsSkipped: skipped,
        recordsFailed: failed,
        statusDetail: `Kindful transactions ${mode} sync page ${pagesProcessed}`
      });

      if (!page.hasMore) break;
      if (!queryToken) {
        pagingComplete = false;
        completionNote =
          "Kindful transactions query ended early: hasMore=true but query_token missing.";
        break;
      }
    }

    if (guard >= 5000) {
      pagingComplete = false;
      completionNote = "Kindful transactions sync stopped at page guard limit.";
      failed += 1;
    }

    syncSettings.kindfulTransactionsQueryToken = queryToken;
    syncSettings.kindfulTransactionsMode = "incremental";
    syncSettings.kindfulLastTransactionsSyncDate = new Date().toISOString();
    await supabase
      .from("integration_connections")
      .update({
        sync_settings_json: syncSettings
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.connection.id);

    return {
      retrieved,
      processed,
      created,
      updated,
      failed,
      skipped,
      reviewQueued,
      pagesProcessed,
      queryToken,
      pagingComplete,
      totalExpected,
      completionNote
    };
  }
}
