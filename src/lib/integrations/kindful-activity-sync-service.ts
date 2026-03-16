import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationSyncJob } from "@/lib/integrations/types";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import { KindfulApiClient } from "@/lib/integrations/kindful-api-client";
import {
  buildPayloadHash,
  extractKindfulContactIds,
  extractKindfulTransactionIds,
  readDateTime,
  readString,
  valueByPath
} from "@/lib/integrations/kindful-mapper";
import {
  archiveRawPayload,
  enqueueDeadLetter,
  isKindfulSchemaMissingError,
  resolveContactByKindfulExternalId,
  resolveDonationByKindfulExternalId,
  upsertCheckpoint
} from "@/lib/integrations/kindful-sync-support";

type KindfulActivitySyncResult = {
  retrieved: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  pagesProcessed: number;
  queryToken: string | null;
  pagingComplete: boolean;
  totalExpected: number | null;
  completionNote: string;
};

type ActivityCandidate = {
  sourceRecordId: string;
  actionType: string;
  actionSummary: string;
  occurredAt: string | null;
  relatedContactExternalId: string | null;
  relatedTransactionExternalId: string | null;
  payload: Record<string, unknown>;
};

function extractActivitiesFromRecord(
  record: Record<string, unknown>,
  sourceHint: "contact" | "transaction"
) {
  const candidates: ActivityCandidate[] = [];
  const contactExternalId = extractKindfulContactIds(record)[0] ?? null;
  const transactionExternalId = extractKindfulTransactionIds(record)[0] ?? null;
  const rawContainers = [
    valueByPath(record, "activities"),
    valueByPath(record, "activity"),
    valueByPath(record, "contact.activities"),
    valueByPath(record, "transaction.activities"),
    valueByPath(record, "interactions"),
    valueByPath(record, "timeline")
  ];

  rawContainers.forEach((container) => {
    if (!Array.isArray(container)) return;
    container.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") return;
      const row = entry as Record<string, unknown>;
      const actionSummary = readString(row, [
        "summary",
        "description",
        "body",
        "note",
        "content",
        "title"
      ]);
      if (!actionSummary) return;
      const sourceRecordId =
        readString(row, ["id", "activity_id", "external_id"]) ||
        `${sourceHint}:${contactExternalId ?? transactionExternalId ?? "activity"}:${index}:${buildPayloadHash(row).slice(0, 8)}`;
      const actionType =
        readString(row, ["type", "action_type", "event_type", "category"]) || "kindful_activity";
      candidates.push({
        sourceRecordId,
        actionType,
        actionSummary,
        occurredAt: readDateTime(row, ["created_at", "occurred_at", "updated_at", "date"]),
        relatedContactExternalId:
          readString(row, ["contact_id", "contact.id", "contact.external_id"]) || contactExternalId,
        relatedTransactionExternalId:
          readString(row, ["transaction_id", "transaction.id", "transaction.external_id"]) ||
          transactionExternalId,
        payload: row
      });
    });
  });

  return candidates;
}

export class KindfulActivitySyncService {
  private async upsertActivity(input: {
    supabase: Awaited<ReturnType<typeof createIntegrationClient>>;
    organizationId: string;
    candidate: ActivityCandidate;
  }) {
    const contactId = input.candidate.relatedContactExternalId
      ? await resolveContactByKindfulExternalId({
          supabase: input.supabase,
          organizationId: input.organizationId,
          externalId: input.candidate.relatedContactExternalId
        })
      : null;
    const donationId = input.candidate.relatedTransactionExternalId
      ? await resolveDonationByKindfulExternalId({
          supabase: input.supabase,
          organizationId: input.organizationId,
          externalId: input.candidate.relatedTransactionExternalId
        })
      : null;
    const entityId = donationId ?? contactId;
    const entityType = donationId ? "donation" : "contact";
    if (!entityId) {
      return { skipped: true, actionTaken: "skipped" as const, activityLogId: null };
    }

    const existingMap = await input.supabase
      .from("activity_external_ids")
      .select("activity_log_id")
      .eq("organization_id", input.organizationId)
      .eq("source_system", "kindful")
      .eq("external_id", input.candidate.sourceRecordId)
      .eq("is_active", true)
      .maybeSingle();
    if (existingMap.error && !isKindfulSchemaMissingError(existingMap.error)) {
      throw existingMap.error;
    }
    let activityLogId = existingMap.data?.activity_log_id
      ? String(existingMap.data.activity_log_id)
      : null;

    let actionTaken: "created" | "updated" = "updated";
    if (activityLogId) {
      const update = await input.supabase
        .from("activity_log")
        .update({
          entity_type: entityType,
          entity_id: entityId,
          related_contact_id: contactId,
          action_type: input.candidate.actionType,
          action_summary: input.candidate.actionSummary
        })
        .eq("organization_id", input.organizationId)
        .eq("id", activityLogId);
      if (update.error) throw update.error;
    } else {
      actionTaken = "created";
      const insert = await input.supabase
        .from("activity_log")
        .insert({
          organization_id: input.organizationId,
          entity_type: entityType,
          entity_id: entityId,
          related_contact_id: contactId,
          action_type: input.candidate.actionType,
          action_summary: input.candidate.actionSummary,
          created_at: input.candidate.occurredAt ?? new Date().toISOString()
        })
        .select("id")
        .single();
      if (insert.error) throw insert.error;
      activityLogId = String(insert.data.id);
    }

    if (!activityLogId) throw new Error("Failed to resolve activity_log id after upsert.");

    const map = await input.supabase.from("activity_external_ids").upsert(
      {
        organization_id: input.organizationId,
        activity_log_id: activityLogId,
        source_system: "kindful",
        external_id: input.candidate.sourceRecordId,
        external_type: "activity",
        raw_source_reference: {
          relatedContactExternalId: input.candidate.relatedContactExternalId,
          relatedTransactionExternalId: input.candidate.relatedTransactionExternalId
        },
        last_seen_at: new Date().toISOString(),
        is_active: true
      },
      { onConflict: "organization_id,source_system,external_id" }
    );
    if (map.error && !isKindfulSchemaMissingError(map.error)) throw map.error;

    return {
      skipped: false,
      actionTaken,
      activityLogId
    };
  }

  private async queryActivitiesFromReadEndpoint(input: {
    apiClient: KindfulApiClient;
    page: number;
    perPage: number;
    updatedSince?: string | null;
  }) {
    return input.apiClient.getActivities({
      page: input.page,
      perPage: input.perPage,
      updatedSince: input.updatedSince ?? null
    });
  }

  async run(input: {
    organizationId: string;
    connection: IntegrationConnection;
    job: IntegrationSyncJob;
    apiClient: KindfulApiClient;
    logService: IntegrationLogService;
  }): Promise<KindfulActivitySyncResult> {
    const supabase = await createIntegrationClient();
    const syncSettings = { ...(input.connection.sync_settings_json ?? {}) } as Record<string, unknown>;
    const activitiesMode =
      (syncSettings.kindfulActivitiesMode as "backfill" | "incremental" | undefined) ??
      "incremental";
    const updatedSince =
      activitiesMode === "incremental"
        ? (syncSettings.kindfulLastActivitiesSyncDate as string | undefined) ?? null
        : null;
    const perPage = Math.max(1, Math.min(Number(syncSettings.pageSize ?? 50), 200));

    let retrieved = 0;
    let processed = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    let pagesProcessed = 0;
    let pagingComplete = true;
    let completionNote = "Activities sync completed.";
    let totalExpected: number | null = null;
    let page = 1;
    const queryToken: string | null = null;
    let useDedicatedEndpoint = true;

    while (pagesProcessed < 2000) {
      let activityCandidates: ActivityCandidate[] = [];
      try {
        if (useDedicatedEndpoint) {
          const activitiesPage = await this.queryActivitiesFromReadEndpoint({
            apiClient: input.apiClient,
            page,
            perPage,
            updatedSince
          });
          pagesProcessed += 1;
          retrieved += activitiesPage.records.length;
          totalExpected = totalExpected ?? activitiesPage.totalExpected;
          activityCandidates = activitiesPage.records.map((record, index) => ({
            sourceRecordId:
              readString(record, ["id", "activity_id", "external_id"]) ||
              `activity:${page}:${index}:${buildPayloadHash(record).slice(0, 12)}`,
            actionType:
              readString(record, ["type", "action_type", "event_type", "category"]) ||
              "kindful_activity",
            actionSummary:
              readString(record, ["summary", "description", "body", "title"]) || "Kindful activity",
            occurredAt: readDateTime(record, ["created_at", "occurred_at", "updated_at", "date"]),
            relatedContactExternalId: readString(record, [
              "contact_id",
              "contact.id",
              "contact.external_id"
            ]),
            relatedTransactionExternalId: readString(record, [
              "transaction_id",
              "transaction.id",
              "transaction.external_id"
            ]),
            payload: record
          }));
          if (!activitiesPage.hasMore || activitiesPage.records.length === 0) break;
          page += 1;
        } else {
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Activities endpoint unavailable.";
        const isMissingEndpoint =
          message.includes("HTTP 404") || message.toLowerCase().includes("/activities");
        if (useDedicatedEndpoint && isMissingEndpoint) {
          useDedicatedEndpoint = false;
          completionNote =
            "Dedicated activities endpoint unavailable; falling back to extracting activities from contacts/transactions payloads.";
          break;
        }
        failed += 1;
        pagingComplete = false;
        await enqueueDeadLetter({
          supabase,
          organizationId: input.organizationId,
          connectionId: input.connection.id,
          syncJobId: input.job.id,
          entityType: "activity",
          sourceRecordId: null,
          payload: { page, updatedSince },
          errorMessage: message,
          retryable: true
        });
        completionNote = "Activities sync failed while querying dedicated endpoint.";
        break;
      }

      for (const candidate of activityCandidates) {
        processed += 1;
        try {
          const upserted = await this.upsertActivity({
            supabase,
            organizationId: input.organizationId,
            candidate
          });
          if (upserted.skipped) {
            skipped += 1;
            continue;
          }
          if (upserted.actionTaken === "created") created += 1;
          else updated += 1;
          await archiveRawPayload({
            supabase,
            organizationId: input.organizationId,
            connectionId: input.connection.id,
            syncJobId: input.job.id,
            sourceSystem: "kindful",
            entityType: "activity",
            sourceRecordId: candidate.sourceRecordId,
            payload: candidate.payload,
            payloadHash: buildPayloadHash(candidate.payload)
          });
        } catch (error) {
          failed += 1;
          await input.logService.enqueueError({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "activity",
            sourceRecordId: candidate.sourceRecordId,
            payload: candidate.payload,
            errorMessage: error instanceof Error ? error.message : "Kindful activity sync failed."
          });
        }
      }
    }

    // Fallback extraction from contact/transaction payloads when dedicated endpoint is unavailable.
    if (!useDedicatedEndpoint) {
      let contactQueryToken: string | null = null;
      let contactGuard = 0;
      const contactQuery =
        activitiesMode === "backfill"
          ? (["linked"] as Array<"linked">)
          : (["linked", "changed"] as Array<"linked" | "changed">);
      while (contactGuard < 2000) {
        contactGuard += 1;
        const contactPage = await input.apiClient.queryContacts({
          query: contactQueryToken ? undefined : contactQuery,
          queryToken: contactQueryToken,
          perPage
        });
        pagesProcessed += 1;
        retrieved += contactPage.records.length;
        for (const record of contactPage.records) {
          const extracted = extractActivitiesFromRecord(record, "contact");
          for (const candidate of extracted) {
            processed += 1;
            try {
              const upserted = await this.upsertActivity({
                supabase,
                organizationId: input.organizationId,
                candidate
              });
              if (upserted.skipped) skipped += 1;
              else if (upserted.actionTaken === "created") created += 1;
              else updated += 1;
            } catch {
              failed += 1;
            }
          }
        }
        if (!contactPage.hasMore) break;
        contactQueryToken = contactPage.nextQueryToken;
        if (!contactQueryToken) break;
      }

      let txQueryToken: string | null = null;
      let txGuard = 0;
      const txQuery =
        activitiesMode === "backfill"
          ? (["linked", "changed"] as Array<"linked" | "changed">)
          : (["changed"] as Array<"changed">);
      while (txGuard < 2000) {
        txGuard += 1;
        const txPage = await input.apiClient.queryTransactions({
          query: txQueryToken ? undefined : txQuery,
          queryToken: txQueryToken,
          perPage
        });
        pagesProcessed += 1;
        retrieved += txPage.records.length;
        for (const record of txPage.records) {
          const extracted = extractActivitiesFromRecord(record, "transaction");
          for (const candidate of extracted) {
            processed += 1;
            try {
              const upserted = await this.upsertActivity({
                supabase,
                organizationId: input.organizationId,
                candidate
              });
              if (upserted.skipped) skipped += 1;
              else if (upserted.actionTaken === "created") created += 1;
              else updated += 1;
            } catch {
              failed += 1;
            }
          }
        }
        if (!txPage.hasMore) break;
        txQueryToken = txPage.nextQueryToken;
        if (!txQueryToken) break;
      }
    }

    await upsertCheckpoint({
      supabase,
      organizationId: input.organizationId,
      connectionId: input.connection.id,
      scope: "activities",
      checkpointKey: "cursor",
      checkpointValue: {
        page,
        updatedSince,
        fallbackMode: !useDedicatedEndpoint
      },
      lastSuccessfulSyncDate: new Date().toISOString()
    });

    syncSettings.kindfulLastActivitiesSyncDate = new Date().toISOString();
    syncSettings.kindfulActivitiesMode = "incremental";
    syncSettings.kindfulActivitiesQueryToken = queryToken;
    syncSettings.kindfulLastActivitiesSummary = {
      pagesProcessed,
      retrieved,
      processed,
      created,
      updated,
      failed,
      skipped,
      completionNote,
      finishedAt: new Date().toISOString()
    };
    const updateConnection = await supabase
      .from("integration_connections")
      .update({
        sync_settings_json: syncSettings
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.connection.id);
    if (updateConnection.error) throw updateConnection.error;

    return {
      retrieved,
      processed,
      created,
      updated,
      failed,
      skipped,
      pagesProcessed,
      queryToken,
      pagingComplete,
      totalExpected,
      completionNote
    };
  }
}
