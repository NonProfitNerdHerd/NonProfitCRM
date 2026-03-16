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

type KindfulNoteSyncResult = {
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

type NoteCandidate = {
  sourceRecordId: string;
  noteBody: string;
  noteCreatedAt: string | null;
  relatedContactExternalId: string | null;
  relatedTransactionExternalId: string | null;
  payload: Record<string, unknown>;
};

function extractNoteCandidatesFromRecord(
  record: Record<string, unknown>,
  sourceHint: "contact" | "transaction"
) {
  const candidates: NoteCandidate[] = [];
  const contactExternalId = extractKindfulContactIds(record)[0] ?? null;
  const transactionExternalId = extractKindfulTransactionIds(record)[0] ?? null;

  const noteValues: Array<{ body: string; payload: Record<string, unknown>; sourceId: string }> = [];
  const directBody = readString(record, ["note", "notes", "memo", "description"]);
  if (directBody) {
    noteValues.push({
      body: directBody,
      payload: record,
      sourceId: `${sourceHint}:${contactExternalId ?? transactionExternalId ?? "root"}`
    });
  }

  const nestedCandidates = [valueByPath(record, "notes"), valueByPath(record, "contact.notes"), valueByPath(record, "transaction.notes")];
  for (const nested of nestedCandidates) {
    if (!nested) continue;
    if (typeof nested === "string" && nested.trim()) {
      noteValues.push({
        body: nested.trim(),
        payload: record,
        sourceId: `${sourceHint}:${contactExternalId ?? transactionExternalId ?? "string"}`
      });
      continue;
    }
    if (Array.isArray(nested)) {
      nested.forEach((entry, index) => {
        if (typeof entry === "string" && entry.trim()) {
          noteValues.push({
            body: entry.trim(),
            payload: record,
            sourceId: `${sourceHint}:${contactExternalId ?? transactionExternalId ?? "array"}:${index}`
          });
        } else if (entry && typeof entry === "object") {
          const row = entry as Record<string, unknown>;
          const body = readString(row, ["body", "note", "text", "content", "description"]);
          if (body) {
            const sourceId =
              readString(row, ["id", "note_id", "external_id"]) ||
              `${sourceHint}:${contactExternalId ?? transactionExternalId ?? "obj"}:${index}`;
            noteValues.push({
              body,
              payload: row,
              sourceId
            });
          }
        }
      });
    }
  }

  for (const note of noteValues) {
    const sourceRecordId = note.sourceId.trim() || buildPayloadHash(note.body);
    candidates.push({
      sourceRecordId,
      noteBody: note.body,
      noteCreatedAt: readDateTime(note.payload, ["created_at", "updated_at", "date", "timestamp"]),
      relatedContactExternalId:
        readString(note.payload, ["contact_id", "contact.id", "contact.external_id"]) || contactExternalId,
      relatedTransactionExternalId:
        readString(note.payload, ["transaction_id", "transaction.id", "transaction.external_id"]) ||
        transactionExternalId,
      payload: note.payload
    });
  }
  return candidates;
}

export class KindfulNoteSyncService {
  private async upsertNote(input: {
    supabase: Awaited<ReturnType<typeof createIntegrationClient>>;
    organizationId: string;
    candidate: NoteCandidate;
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

    const noteExternalLookup = await input.supabase
      .from("note_external_ids")
      .select("id, note_id")
      .eq("organization_id", input.organizationId)
      .eq("source_system", "kindful")
      .eq("external_id", input.candidate.sourceRecordId)
      .eq("is_active", true)
      .maybeSingle();
    if (noteExternalLookup.error && !isKindfulSchemaMissingError(noteExternalLookup.error)) {
      throw noteExternalLookup.error;
    }

    let noteId = noteExternalLookup.data?.note_id ? String(noteExternalLookup.data.note_id) : null;
    let actionTaken: "created" | "updated" = "updated";
    if (noteId) {
      const update = await input.supabase
        .from("notes")
        .update({
          contact_id: contactId,
          entity_type: donationId ? "donation" : contactId ? "contact" : "kindful",
          entity_id: donationId ?? contactId ?? null,
          note_type: "kindful_sync",
          body: input.candidate.noteBody,
          updated_at: new Date().toISOString()
        })
        .eq("organization_id", input.organizationId)
        .eq("id", noteId);
      if (update.error) throw update.error;
    } else {
      actionTaken = "created";
      const insert = await input.supabase
        .from("notes")
        .insert({
          organization_id: input.organizationId,
          contact_id: contactId,
          entity_type: donationId ? "donation" : contactId ? "contact" : "kindful",
          entity_id: donationId ?? contactId ?? null,
          note_type: "kindful_sync",
          body: input.candidate.noteBody,
          contains_pii: false,
          visibility_classification: "staff_public",
          created_at: input.candidate.noteCreatedAt ?? new Date().toISOString()
        })
        .select("id")
        .single();
      if (insert.error) throw insert.error;
      noteId = String(insert.data.id);
    }

    if (!noteId) throw new Error("Failed to resolve note id after upsert.");

    const map = await input.supabase.from("note_external_ids").upsert(
      {
        organization_id: input.organizationId,
        note_id: noteId,
        source_system: "kindful",
        external_id: input.candidate.sourceRecordId,
        external_type: "note",
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
      noteId,
      actionTaken
    };
  }

  private async queryNotesFromReadEndpoint(input: {
    apiClient: KindfulApiClient;
    page: number;
    perPage: number;
    updatedSince?: string | null;
  }) {
    return input.apiClient.getNotes({
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
  }): Promise<KindfulNoteSyncResult> {
    const supabase = await createIntegrationClient();
    const syncSettings = { ...(input.connection.sync_settings_json ?? {}) } as Record<string, unknown>;
    const notesMode =
      (syncSettings.kindfulNotesMode as "backfill" | "incremental" | undefined) ?? "incremental";
    const updatedSince =
      notesMode === "incremental"
        ? (syncSettings.kindfulLastNotesSyncDate as string | undefined) ?? null
        : null;
    const perPage = Math.max(1, Math.min(Number(syncSettings.pageSize ?? 50), 200));

    let retrieved = 0;
    let processed = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    const skipped = 0;
    let pagesProcessed = 0;
    let pagingComplete = true;
    let completionNote = "Notes sync completed.";
    let totalExpected: number | null = null;
    let page = 1;
    const queryToken: string | null = null;

    let useDedicatedNotesEndpoint = true;
    while (pagesProcessed < 2000) {
      let noteCandidates: NoteCandidate[] = [];
      try {
        if (useDedicatedNotesEndpoint) {
          const notesPage = await this.queryNotesFromReadEndpoint({
            apiClient: input.apiClient,
            page,
            perPage,
            updatedSince
          });
          pagesProcessed += 1;
          retrieved += notesPage.records.length;
          totalExpected = totalExpected ?? notesPage.totalExpected;
          noteCandidates = notesPage.records.flatMap((record, index) => {
            const body = readString(record, ["body", "note", "text", "content", "description"]);
            if (!body) return [];
            const sourceRecordId =
              readString(record, ["id", "note_id", "external_id"]) ||
              `note:${page}:${index}:${buildPayloadHash(record).slice(0, 12)}`;
            return [
              {
                sourceRecordId,
                noteBody: body,
                noteCreatedAt: readDateTime(record, ["created_at", "updated_at", "date"]),
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
              }
            ];
          });
          if (!notesPage.hasMore || notesPage.records.length === 0) {
            break;
          }
          page += 1;
        } else {
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Notes endpoint unavailable.";
        const isMissingEndpoint =
          message.includes("HTTP 404") || message.toLowerCase().includes("/notes");
        if (useDedicatedNotesEndpoint && isMissingEndpoint) {
          useDedicatedNotesEndpoint = false;
          completionNote =
            "Dedicated notes endpoint unavailable; falling back to extracting notes from contacts/transactions payloads.";
          break;
        }
        failed += 1;
        pagingComplete = false;
        await enqueueDeadLetter({
          supabase,
          organizationId: input.organizationId,
          connectionId: input.connection.id,
          syncJobId: input.job.id,
          entityType: "note",
          sourceRecordId: null,
          payload: { page, updatedSince },
          errorMessage: message,
          retryable: true
        });
        completionNote = "Notes sync failed while querying dedicated endpoint.";
        break;
      }

      for (const candidate of noteCandidates) {
        processed += 1;
        try {
          const upserted = await this.upsertNote({
            supabase,
            organizationId: input.organizationId,
            candidate
          });
          if (upserted.actionTaken === "created") created += 1;
          else updated += 1;
          await archiveRawPayload({
            supabase,
            organizationId: input.organizationId,
            connectionId: input.connection.id,
            syncJobId: input.job.id,
            sourceSystem: "kindful",
            entityType: "note",
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
            entityType: "note",
            sourceRecordId: candidate.sourceRecordId,
            payload: candidate.payload,
            errorMessage: error instanceof Error ? error.message : "Kindful note sync failed."
          });
        }
      }
    }

    // Fallback extraction from contact/transaction payloads when dedicated notes endpoint is unavailable.
    if (!useDedicatedNotesEndpoint) {
      let contactQueryToken: string | null = null;
      let contactGuard = 0;
      const contactQuery =
        notesMode === "backfill"
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
          const candidates = extractNoteCandidatesFromRecord(record, "contact");
          for (const candidate of candidates) {
            processed += 1;
            try {
              const upserted = await this.upsertNote({
                supabase,
                organizationId: input.organizationId,
                candidate
              });
              if (upserted.actionTaken === "created") created += 1;
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
        notesMode === "backfill"
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
          const candidates = extractNoteCandidatesFromRecord(record, "transaction");
          for (const candidate of candidates) {
            processed += 1;
            try {
              const upserted = await this.upsertNote({
                supabase,
                organizationId: input.organizationId,
                candidate
              });
              if (upserted.actionTaken === "created") created += 1;
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
      scope: "notes",
      checkpointKey: "cursor",
      checkpointValue: {
        page,
        updatedSince,
        fallbackMode: !useDedicatedNotesEndpoint
      },
      lastSuccessfulSyncDate: new Date().toISOString()
    });

    syncSettings.kindfulLastNotesSyncDate = new Date().toISOString();
    syncSettings.kindfulNotesMode = "incremental";
    syncSettings.kindfulNotesQueryToken = queryToken;
    syncSettings.kindfulLastNotesSummary = {
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
