import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationSyncJob } from "@/lib/integrations/types";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import { WebconnexApiClient } from "@/lib/integrations/webconnex-api-client";
import { GIVINGFUEL_DEFAULT_PAGE_LIMIT } from "@/lib/integrations/givingfuel-contacts-config";

type ContactSyncResult = {
  retrieved: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  pagesProcessed: number;
  cursor: string | null;
  pagingComplete: boolean;
  totalExpected: number | null;
  nextCheckpoint: string | null;
  completionNote: string;
};

type ContactSyncRunMode = "full" | "incremental";

function isExternalIdSchemaMissingError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return message.includes("contact_external_ids") || message.includes("resolve_contact_by_external_id");
}

function readString(record: Record<string, unknown>, keys: string[]) {
  const readByPath = (path: string) => {
    if (!path.includes(".")) return record[path];
    const segments = path.split(".");
    let cursor: unknown = record;
    for (const segment of segments) {
      if (!cursor || typeof cursor !== "object") return undefined;
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor;
  };

  for (const key of keys) {
    const value = readByPath(key);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "bigint") return value.toString();
  }
  return "";
}

function readDateTime(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
  }
  return null;
}

export class ContactSyncService {
  private async upsertContactFromRecord(input: {
    supabase: Awaited<ReturnType<typeof createIntegrationClient>>;
    organizationId: string;
    syncSettings: Record<string, unknown>;
    record: Record<string, unknown>;
  }) {
    const externalId = readString(input.record, [
      "id",
      "displayId",
      "customer_id",
      "customerId",
      "external_id",
      "contact_id",
      "donor_id"
    ]);
    if (!externalId) {
      throw new Error("Missing external contact id in source payload.");
    }

    const firstName = readString(input.record, [
      "first_name",
      "firstName",
      "firstNameOrgName",
      "billing.firstName"
    ]);
    const lastName = readString(input.record, ["last_name", "lastName", "billing.lastName"]);
    const email = readString(input.record, ["email", "primary_email"]);
    const phone = readString(input.record, [
      "phone",
      "mobile_phone",
      "mobile",
      "primary_phone",
      "billing.phone"
    ]);
    const addressLine1 = readString(input.record, ["address_line_1", "billing.address.street1"]);
    const city = readString(input.record, ["city", "billing.address.city"]);
    const state = readString(input.record, ["state", "billing.address.state"]);
    const postalCode = readString(input.record, ["postal_code", "billing.address.postalCode"]);
    const country = readString(input.record, ["country", "billing.address.country"]);
    const sourceModifiedAt = readDateTime(input.record, [
      "updated_at",
      "last_modified_at",
      "modified_at",
      "dateUpdated",
      "dateCreated"
    ]);

    let contactId: string | null = null;
    const resolveByExternal = await input.supabase.rpc("resolve_contact_by_external_id", {
      org_id: input.organizationId,
      source: "givingfuel",
      external: externalId
    });
    if (!resolveByExternal.error && resolveByExternal.data) {
      contactId = String(resolveByExternal.data);
    }
    if (resolveByExternal.error && !isExternalIdSchemaMissingError(resolveByExternal.error)) {
      throw resolveByExternal.error;
    }
    if (!contactId) {
      const { data: existingRef, error: existingRefError } = await input.supabase
        .from("contact_external_references")
        .select("id, contact_id")
        .eq("organization_id", input.organizationId)
        .in("source_system", ["givingfuel", "webconnex"])
        .eq("external_record_id", externalId)
        .maybeSingle();
      if (existingRefError) throw existingRefError;
      contactId = (existingRef?.contact_id as string | undefined) ?? null;
    }
    let actionTaken = "updated";
    const normalizedEntityType = "person";
    const normalizedOrganizationName = null;

    if (!contactId) {
      const allowEmailFallback = Boolean(
        input.syncSettings.fallbackContactMatch === "email_if_configured"
      );
      if (allowEmailFallback && email) {
        const { data: emailMatch } = await input.supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", input.organizationId)
          .eq("email", email)
          .maybeSingle();
        contactId = (emailMatch?.id as string | undefined) ?? null;
      }
    }

    if (contactId) {
      const { error: updateError } = await input.supabase
        .from("contacts")
        .update({
          first_name: firstName || "Unknown",
          last_name: lastName || "Unknown",
          email: email || null,
          phone: phone || null,
          organization_name: normalizedOrganizationName,
          entity_type: normalizedEntityType,
          address_line_1: addressLine1 || null,
          city: city || null,
          state: state || null,
          postal_code: postalCode || null,
          country: country || null,
          updated_at: new Date().toISOString()
        })
        .eq("organization_id", input.organizationId)
        .eq("id", contactId);
      if (updateError) throw updateError;
    } else {
      const { data: createdContact, error: createError } = await input.supabase
        .from("contacts")
        .insert({
          organization_id: input.organizationId,
          first_name: firstName || "Unknown",
          last_name: lastName || "Unknown",
          email: email || null,
          phone: phone || null,
          organization_name: normalizedOrganizationName,
          entity_type: normalizedEntityType,
          tracking_status: "lead",
          address_line_1: addressLine1 || null,
          city: city || null,
          state: state || null,
          postal_code: postalCode || null,
          country: country || null,
          donor_status: "prospect",
          member_status: "none",
          external_source: "givingfuel",
          external_source_id: externalId
        })
        .select("id")
        .single();
      if (createError) throw createError;
      contactId = createdContact.id as string;
      actionTaken = "created";
    }

    const { error: refError } = await input.supabase.from("contact_external_references").upsert(
      {
        organization_id: input.organizationId,
        contact_id: contactId,
        source_system: "givingfuel",
        external_record_id: externalId,
        external_record_type: "contact",
        last_source_modified_date: sourceModifiedAt,
        last_synced_date: new Date().toISOString()
      },
      { onConflict: "organization_id,source_system,external_record_id" }
    );
    if (refError) throw refError;

    const { error: externalIdError } = await input.supabase.from("contact_external_ids").upsert(
      {
        organization_id: input.organizationId,
        contact_id: contactId,
        source_system: "givingfuel",
        external_id: externalId,
        external_type: "contact",
        is_primary: true,
        is_active: true
      },
      { onConflict: "organization_id,source_system,external_id" }
    );
    if (externalIdError && !isExternalIdSchemaMissingError(externalIdError)) {
      throw externalIdError;
    }

    return {
      externalId,
      contactId,
      actionTaken: actionTaken as "created" | "updated",
      sourceModifiedAt
    };
  }

  async retrySingleRecord(input: {
    organizationId: string;
    connection: IntegrationConnection;
    job: IntegrationSyncJob;
    record: Record<string, unknown>;
    logService: IntegrationLogService;
  }) {
    const supabase = await createIntegrationClient();
    const syncSettings = input.connection.sync_settings_json ?? {};
    const synced = await this.upsertContactFromRecord({
      supabase,
      organizationId: input.organizationId,
      syncSettings,
      record: input.record
    });

    await input.logService.addSyncLog({
      organizationId: input.organizationId,
      integrationConnectionId: input.connection.id,
      jobId: input.job.id,
      entityType: "contact",
      sourceRecordId: synced.externalId,
      crmRecordId: synced.contactId,
      actionTaken: synced.actionTaken,
      status: "processed",
      message: "Contact synchronized."
    });

    return {
      externalId: synced.externalId,
      created: synced.actionTaken === "created" ? 1 : 0,
      updated: synced.actionTaken === "updated" ? 1 : 0
    };
  }

  async run(input: {
    organizationId: string;
    connection: IntegrationConnection;
    job: IntegrationSyncJob;
    apiClient: WebconnexApiClient;
    logService: IntegrationLogService;
    runMode: ContactSyncRunMode;
    incrementalCheckpoint?: string | null;
    onProgress?: (payload: {
      currentPage: number;
      currentCursor: string | null;
      recordsRetrieved: number;
      recordsProcessed: number;
      recordsCreated: number;
      recordsUpdated: number;
      recordsSkipped: number;
      recordsFailed: number;
      totalRecordsExpected: number | null;
      statusMessage: string;
    }) => Promise<void> | void;
  }): Promise<ContactSyncResult> {
    const supabase = await createIntegrationClient();
    const syncSettings = { ...(input.connection.sync_settings_json ?? {}) } as Record<string, unknown>;
    const runStartedAt = new Date().toISOString();
    const requestedCheckpoint =
      input.runMode === "incremental" ? readDateTime({ value: input.incrementalCheckpoint }, ["value"]) : null;
    let cursor: string | null = null;
    let retrieved = 0;
    let processed = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    let hasMore = true;
    let pageGuard = 0;
    let pagesProcessed = 0;
    let pagingComplete = true;
    let completionNote = "Paging complete.";
    let totalExpected: number | null = null;
    let latestSourceModifiedAt: string | null = null;

    while (hasMore && pageGuard < 10000) {
      pageGuard += 1;
      const startingCursor: string | null = cursor;
      let page: Awaited<ReturnType<WebconnexApiClient["getContacts"]>>;
      try {
        page = await input.apiClient.getContacts({
          startingAfter: cursor,
          limit: GIVINGFUEL_DEFAULT_PAGE_LIMIT,
          ...(requestedCheckpoint
            ? {
                dateUpdatedAfter: requestedCheckpoint,
                dateCreatedAfter: requestedCheckpoint
              }
            : {})
        });
      } catch (pageError) {
        failed += 1;
        pagingComplete = false;
        completionNote = "Contacts sync stopped because a page request failed.";
        await input.logService.enqueueError({
          organizationId: input.organizationId,
          integrationConnectionId: input.connection.id,
          jobId: input.job.id,
          entityType: "integration",
          payload: { startingAfter: startingCursor, limit: GIVINGFUEL_DEFAULT_PAGE_LIMIT },
          errorMessage:
            pageError instanceof Error ? pageError.message : "Contacts page request failed."
        });
        break;
      }
      pagesProcessed += 1;
      retrieved += page.records.length;
      hasMore = page.hasMore;
      if (totalExpected === null && typeof page.totalResults === "number" && Number.isFinite(page.totalResults)) {
        totalExpected = Math.max(0, Math.floor(page.totalResults));
      }
      await input.logService.addSyncLog({
        organizationId: input.organizationId,
        integrationConnectionId: input.connection.id,
        jobId: input.job.id,
        entityType: "contacts_page",
        sourceRecordId: startingCursor,
        status: "processed",
        message: `Fetched page ${pagesProcessed}: ${page.records.length} record(s), hasMore=${String(page.hasMore)}, nextCursor=${page.nextCursor ?? "null"}`,
        requestPayload: {
          startingAfter: startingCursor,
          limit: GIVINGFUEL_DEFAULT_PAGE_LIMIT,
          runMode: input.runMode,
          incrementalCheckpoint: requestedCheckpoint
        },
        responsePayload: {
          recordCount: page.records.length,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          totalResults: page.totalResults
        }
      });

      for (const record of page.records) {
        processed += 1;
        const externalId =
          readString(record, [
            "id",
            "displayId",
            "customer_id",
            "customerId",
            "external_id",
            "contact_id",
            "donor_id"
          ]) || null;

        try {
          const synced = await this.upsertContactFromRecord({
            supabase,
            organizationId: input.organizationId,
            syncSettings,
            record
          });
          if (synced.actionTaken === "created") {
            created += 1;
          } else {
            updated += 1;
          }
          if (synced.sourceModifiedAt) {
            if (!latestSourceModifiedAt || synced.sourceModifiedAt > latestSourceModifiedAt) {
              latestSourceModifiedAt = synced.sourceModifiedAt;
            }
          }

          await input.logService.addSyncLog({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "contact",
            sourceRecordId: synced.externalId,
            crmRecordId: synced.contactId,
            actionTaken: synced.actionTaken,
            status: "processed",
            message: "Contact synchronized."
          });
        } catch (error) {
          failed += 1;
          if (error instanceof Error && error.message.includes("Missing external contact id")) {
            skipped += 1;
          }
          await input.logService.enqueueError({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "contact",
            sourceRecordId: externalId,
            payload: record,
            errorMessage: error instanceof Error ? error.message : "Contact sync failed."
          });
        }
      }

      const lastRecord = page.records.length
        ? (page.records[page.records.length - 1] as Record<string, unknown>)
        : null;
      const fallbackCursor = lastRecord
        ? readString(lastRecord, [
            "id",
            "displayId",
            "customer_id",
            "customerId",
            "external_id",
            "contact_id",
            "donor_id"
          ])
        : "";
      cursor = (page.nextCursor ?? fallbackCursor) || cursor;
      const statusMessage = `Syncing contacts page ${pagesProcessed}${cursor ? ` (cursor ${cursor})` : ""}`;
      await input.logService.updateJobProgress({
        organizationId: input.organizationId,
        jobId: input.job.id,
        currentPage: pagesProcessed,
        currentCursor: cursor,
        totalRecordsExpected: totalExpected,
        recordsRetrieved: retrieved,
        recordsProcessed: processed,
        recordsCreated: created,
        recordsUpdated: updated,
        recordsSkipped: skipped,
        recordsFailed: failed,
        statusDetail: statusMessage
      });
      if (input.onProgress) {
        await input.onProgress({
          currentPage: pagesProcessed,
          currentCursor: cursor,
          recordsRetrieved: retrieved,
          recordsProcessed: processed,
          recordsCreated: created,
          recordsUpdated: updated,
          recordsSkipped: skipped,
          recordsFailed: failed,
          totalRecordsExpected: totalExpected,
          statusMessage
        });
      }

      if (!hasMore) break;
      if (!cursor) {
        hasMore = false;
        pagingComplete = false;
        completionNote = "Contacts pagination ended early because no cursor was returned.";
      }
      if (startingCursor && cursor === startingCursor) {
        hasMore = false;
        failed += 1;
        pagingComplete = false;
        completionNote = "Contacts pagination ended early because cursor did not advance.";
        await input.logService.enqueueError({
          organizationId: input.organizationId,
          integrationConnectionId: input.connection.id,
          jobId: input.job.id,
          entityType: "integration",
          payload: { cursor: startingCursor, nextCursor: cursor },
          errorMessage:
            "Contacts pagination stopped because cursor did not advance. Check API pagination response fields."
        });
      }

    }
    if (pageGuard >= 10000 && hasMore) {
      failed += 1;
      pagingComplete = false;
      completionNote = "Contacts pagination guard limit reached before completion.";
    }

    const nextCheckpoint = latestSourceModifiedAt ?? requestedCheckpoint ?? runStartedAt;

    await input.logService.addSyncLog({
      organizationId: input.organizationId,
      integrationConnectionId: input.connection.id,
      jobId: input.job.id,
      entityType: "contacts_summary",
      status: "processed",
      message: `Contacts sync summary: mode=${input.runMode}, pages=${pagesProcessed}, retrieved=${retrieved}, processed=${processed}, created=${created}, updated=${updated}, failed=${failed}, skipped=${skipped}, pagingComplete=${String(pagingComplete)}, nextCursor=${cursor ?? "null"}, nextCheckpoint=${nextCheckpoint}`,
      responsePayload: {
        runMode: input.runMode,
        pagesProcessed,
        retrieved,
        processed,
        created,
        updated,
        failed,
        skipped,
        pagingComplete,
        completionNote,
        nextCursor: cursor,
        totalExpected,
        nextCheckpoint
      }
    });

    return {
      retrieved,
      processed,
      created,
      updated,
      failed,
      skipped,
      pagesProcessed,
      cursor,
      pagingComplete,
      totalExpected,
      nextCheckpoint,
      completionNote
    };
  }
}
