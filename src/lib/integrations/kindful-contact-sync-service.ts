import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationSyncJob } from "@/lib/integrations/types";
import { KindfulApiClient } from "@/lib/integrations/kindful-api-client";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import {
  buildPayloadHash,
  extractGroups,
  extractKindfulContactIds,
  readDateTime,
  readString
} from "@/lib/integrations/kindful-mapper";
import {
  archiveRawPayload,
  enqueueDeadLetter,
  enqueueReview,
  extractCustomFieldsMap,
  findLikelyContactMatch,
  isExternalIdSchemaMissingError,
  upsertCheckpoint
} from "@/lib/integrations/kindful-sync-support";

type KindfulContactSyncResult = {
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

function safeArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeGroupTag(name: string) {
  return `kindful:${name.trim()}`.slice(0, 120);
}

export class KindfulContactSyncService {
  private async resolveByExternalIds(input: {
    supabase: Awaited<ReturnType<typeof createIntegrationClient>>;
    organizationId: string;
    externalIds: string[];
  }) {
    for (const externalId of input.externalIds) {
      const resolveResult = await input.supabase.rpc("resolve_contact_by_external_id", {
        org_id: input.organizationId,
        source: "kindful",
        external: externalId
      });
      if (!resolveResult.error && resolveResult.data) return String(resolveResult.data);
      if (resolveResult.error && !isExternalIdSchemaMissingError(resolveResult.error)) {
        throw resolveResult.error;
      }

      const refResult = await input.supabase
        .from("contact_external_references")
        .select("contact_id")
        .eq("organization_id", input.organizationId)
        .eq("source_system", "kindful")
        .eq("external_record_id", externalId)
        .maybeSingle();
      if (refResult.error) throw refResult.error;
      if (refResult.data?.contact_id) return String(refResult.data.contact_id);
    }
    return null;
  }

  private async upsertContactFromRecord(input: {
    supabase: Awaited<ReturnType<typeof createIntegrationClient>>;
    organizationId: string;
    connection: IntegrationConnection;
    syncJobId: string;
    record: Record<string, unknown>;
  }): Promise<{
    externalId: string;
    contactId: string;
    actionTaken: "created" | "updated";
    queuedForReview: boolean;
    reviewReason?: string;
    confidenceScore?: number | null;
    candidateMatches?: Array<Record<string, unknown>>;
  }> {
    const externalIds = extractKindfulContactIds(input.record).filter(Boolean);
    const primaryExternalId = externalIds[0] ?? "";
    if (!primaryExternalId) {
      throw new Error("Kindful contact is missing a stable external ID.");
    }

    let contactId =
      (await this.resolveByExternalIds({
        supabase: input.supabase,
        organizationId: input.organizationId,
        externalIds
      })) ?? null;

    if (!contactId) {
      const likely = await findLikelyContactMatch({
        supabase: input.supabase,
        organizationId: input.organizationId,
        source: input.record
      });
      if (likely.shouldQueueReview) {
        await enqueueReview({
          supabase: input.supabase,
          organizationId: input.organizationId,
          connectionId: input.connection.id,
          syncJobId: input.syncJobId,
          entityType: "contact",
          sourceRecordId: primaryExternalId,
          reason: "Ambiguous contact match confidence below auto-merge threshold.",
          confidenceScore: likely.confidenceScore,
          sourcePayload: input.record,
          candidateMatches: likely.candidateMatches
        });
        return {
          externalId: primaryExternalId,
          contactId: "",
          actionTaken: "updated",
          queuedForReview: true,
          reviewReason: "Ambiguous contact match",
          confidenceScore: likely.confidenceScore,
          candidateMatches: likely.candidateMatches
        };
      }
      contactId = likely.matchContactId;
    }

    const firstName = readString(input.record, ["first_name", "firstName", "contact.first_name"]);
    const lastName = readString(input.record, ["last_name", "lastName", "contact.last_name"]);
    const email = readString(input.record, ["email", "primary_email", "contact.email"]);
    const phone = readString(input.record, ["phone", "mobile_phone", "contact.phone"]);
    const alternatePhone = readString(input.record, ["alternate_phone", "home_phone"]);
    const addressLine1 = readString(input.record, ["address_line_1", "address.street1", "address.line1"]);
    const addressLine2 = readString(input.record, ["address_line_2", "address.street2", "address.line2"]);
    const city = readString(input.record, ["city", "address.city"]);
    const state = readString(input.record, ["state", "address.state"]);
    const postalCode = readString(input.record, ["postal_code", "zip", "address.postal_code"]);
    const country = readString(input.record, ["country", "address.country"]);
    const organizationName = readString(input.record, [
      "organization_name",
      "company",
      "organization",
      "contact.organization_name"
    ]);
    const sourceModifiedAt = readDateTime(input.record, ["updated_at", "last_modified", "created_at"]);

    let existingTags: string[] = [];
    let existingCommunicationPrefs: Record<string, unknown> = {};
    let actionTaken: "created" | "updated" = "updated";
    if (contactId) {
      const existingResult = await input.supabase
        .from("contacts")
        .select("id, tags, communication_preferences")
        .eq("organization_id", input.organizationId)
        .eq("id", contactId)
        .maybeSingle();
      if (existingResult.error) throw existingResult.error;
      const existing = existingResult.data as
        | { tags?: string[] | null; communication_preferences?: Record<string, unknown> | null }
        | null;
      existingTags = safeArray<string>(existing?.tags);
      existingCommunicationPrefs =
        (existing?.communication_preferences as Record<string, unknown> | null) ?? {};
    }

    const groupTags = extractGroups(input.record).map(normalizeGroupTag);
    const mergedTags = Array.from(new Set([...existingTags, ...groupTags])).slice(0, 200);
    const customFields = extractCustomFieldsMap(input.record);
    const communicationPreferences = {
      ...existingCommunicationPrefs,
      kindful_custom_fields: customFields
    };

    if (contactId) {
      const updateResult = await input.supabase
        .from("contacts")
        .update({
          first_name: firstName || "Unknown",
          last_name: lastName || "Unknown",
          email: email || null,
          phone: phone || null,
          alternate_phone: alternatePhone || null,
          address_line_1: addressLine1 || null,
          address_line_2: addressLine2 || null,
          city: city || null,
          state: state || null,
          postal_code: postalCode || null,
          country: country || null,
          organization_name: organizationName || null,
          communication_preferences: communicationPreferences,
          tags: mergedTags,
          external_source: "kindful",
          external_source_id: primaryExternalId,
          updated_at: new Date().toISOString()
        })
        .eq("organization_id", input.organizationId)
        .eq("id", contactId);
      if (updateResult.error) throw updateResult.error;
    } else {
      actionTaken = "created";
      const createResult = await input.supabase
        .from("contacts")
        .insert({
          organization_id: input.organizationId,
          first_name: firstName || "Unknown",
          last_name: lastName || "Unknown",
          email: email || null,
          phone: phone || null,
          alternate_phone: alternatePhone || null,
          address_line_1: addressLine1 || null,
          address_line_2: addressLine2 || null,
          city: city || null,
          state: state || null,
          postal_code: postalCode || null,
          country: country || null,
          organization_name: organizationName || null,
          communication_preferences: communicationPreferences,
          tags: mergedTags,
          donor_status: "prospect",
          member_status: "none",
          external_source: "kindful",
          external_source_id: primaryExternalId
        })
        .select("id")
        .single();
      if (createResult.error) throw createResult.error;
      contactId = String(createResult.data.id);
    }

    if (!contactId) {
      throw new Error("Contact upsert failed to produce a contact ID.");
    }

    for (const externalId of externalIds) {
      const referenceResult = await input.supabase.from("contact_external_references").upsert(
        {
          organization_id: input.organizationId,
          contact_id: contactId,
          source_system: "kindful",
          external_record_id: externalId,
          external_record_type: "contact",
          last_source_modified_date: sourceModifiedAt,
          last_synced_date: new Date().toISOString()
        },
        { onConflict: "organization_id,source_system,external_record_id" }
      );
      if (referenceResult.error) throw referenceResult.error;

      const externalResult = await input.supabase.from("contact_external_ids").upsert(
        {
          organization_id: input.organizationId,
          contact_id: contactId,
          source_system: "kindful",
          external_id: externalId,
          external_type: "contact",
          is_primary: externalId === primaryExternalId,
          is_active: true
        },
        { onConflict: "organization_id,source_system,external_id" }
      );
      if (externalResult.error && !isExternalIdSchemaMissingError(externalResult.error)) {
        throw externalResult.error;
      }
    }

    return {
      externalId: primaryExternalId,
      contactId,
      actionTaken,
      queuedForReview: false
    };
  }

  async run(input: {
    organizationId: string;
    connection: IntegrationConnection;
    job: IntegrationSyncJob;
    apiClient: KindfulApiClient;
    logService: IntegrationLogService;
  }): Promise<KindfulContactSyncResult> {
    const supabase = await createIntegrationClient();
    const syncSettings = { ...(input.connection.sync_settings_json ?? {}) } as Record<string, unknown>;

    const checkpoints = await supabase
      .from("integration_sync_checkpoints")
      .select("checkpoint_key, checkpoint_value")
      .eq("organization_id", input.organizationId)
      .eq("integration_connection_id", input.connection.id)
      .eq("scope", "contacts");
    if (checkpoints.error && !String(checkpoints.error.message ?? "").includes("integration_sync_checkpoints")) {
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
      (syncSettings.kindfulContactsQueryToken as string | undefined) ??
      null;
    let mode: "backfill" | "incremental" =
      (syncSettings.kindfulContactsMode as "backfill" | "incremental" | undefined) ??
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
        ? (["linked"] as Array<"linked">)
        : (["linked", "changed"] as Array<"linked" | "changed">);

    while (guard < 5000) {
      guard += 1;
      let page;
      try {
        page = await input.apiClient.queryContacts({
          query: queryToken ? undefined : baseQuery,
          queryToken,
          perPage: Number(syncSettings.pageSize ?? 50)
        });
      } catch (error) {
        failed += 1;
        pagingComplete = false;
        completionNote = "Kindful contacts sync stopped after query failure.";
        await input.logService.enqueueError({
          organizationId: input.organizationId,
          integrationConnectionId: input.connection.id,
          jobId: input.job.id,
          entityType: "kindful_contacts_query",
          sourceRecordId: queryToken,
          payload: { queryToken, mode },
          errorMessage: error instanceof Error ? error.message : "Kindful contacts query failed."
        });
        await enqueueDeadLetter({
          supabase,
          organizationId: input.organizationId,
          connectionId: input.connection.id,
          syncJobId: input.job.id,
          entityType: "kindful_contacts_query",
          sourceRecordId: queryToken,
          payload: { queryToken, mode },
          errorMessage: error instanceof Error ? error.message : "Kindful contacts query failed.",
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
        entityType: "kindful_contacts_page",
        sourceRecordId: queryToken,
        status: "processed",
        message: `Kindful contacts page ${pagesProcessed}: ${page.records.length} records`,
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
        const externalId = extractKindfulContactIds(record)[0] ?? null;
        try {
          const synced = await this.upsertContactFromRecord({
            supabase,
            organizationId: input.organizationId,
            connection: input.connection,
            syncJobId: input.job.id,
            record
          });

          await archiveRawPayload({
            supabase,
            organizationId: input.organizationId,
            connectionId: input.connection.id,
            syncJobId: input.job.id,
            sourceSystem: "kindful",
            entityType: "contact",
            sourceRecordId: synced.externalId || externalId,
            payload: record,
            payloadHash
          });

          if (synced.queuedForReview) {
            reviewQueued += 1;
            skipped += 1;
            await input.logService.addSyncLog({
              organizationId: input.organizationId,
              integrationConnectionId: input.connection.id,
              jobId: input.job.id,
              entityType: "contact",
              sourceRecordId: synced.externalId,
              status: "review",
              actionTaken: "queued_for_review",
              message: synced.reviewReason ?? "Queued for manual review.",
              responsePayload: {
                confidenceScore: synced.confidenceScore,
                candidateMatches: synced.candidateMatches ?? []
              }
            });
          } else if (synced.actionTaken === "created") {
            created += 1;
            await input.logService.addSyncLog({
              organizationId: input.organizationId,
              integrationConnectionId: input.connection.id,
              jobId: input.job.id,
              entityType: "contact",
              sourceRecordId: synced.externalId,
              crmRecordId: synced.contactId,
              actionTaken: "created",
              status: "processed",
              message: "Kindful contact created."
            });
          } else {
            updated += 1;
            await input.logService.addSyncLog({
              organizationId: input.organizationId,
              integrationConnectionId: input.connection.id,
              jobId: input.job.id,
              entityType: "contact",
              sourceRecordId: synced.externalId,
              crmRecordId: synced.contactId,
              actionTaken: "updated",
              status: "processed",
              message: "Kindful contact updated."
            });
          }
        } catch (error) {
          failed += 1;
          await input.logService.enqueueError({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "contact",
            sourceRecordId: externalId,
            payload: record,
            errorMessage: error instanceof Error ? error.message : "Kindful contact sync failed."
          });
          await enqueueDeadLetter({
            supabase,
            organizationId: input.organizationId,
            connectionId: input.connection.id,
            syncJobId: input.job.id,
            entityType: "contact",
            sourceRecordId: externalId,
            payload: record,
            errorMessage: error instanceof Error ? error.message : "Kindful contact sync failed.",
            retryable: true
          });
        }
      }

      queryToken = page.nextQueryToken;
      await upsertCheckpoint({
        supabase,
        organizationId: input.organizationId,
        connectionId: input.connection.id,
        scope: "contacts",
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
        statusDetail: `Kindful contacts ${mode} sync page ${pagesProcessed}`
      });

      if (!page.hasMore) break;
      if (!queryToken) {
        pagingComplete = false;
        completionNote = "Kindful contacts query ended early: hasMore=true but query_token missing.";
        break;
      }
    }

    if (guard >= 5000) {
      pagingComplete = false;
      completionNote = "Kindful contacts sync stopped at page guard limit.";
      failed += 1;
    }

    syncSettings.kindfulContactsQueryToken = queryToken;
    syncSettings.kindfulContactsMode = "incremental";
    syncSettings.kindfulLastContactsSyncDate = new Date().toISOString();
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
