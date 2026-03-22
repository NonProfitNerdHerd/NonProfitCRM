import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationDefinition, SyncScope } from "@/lib/integrations/types";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import { WebconnexApiClient } from "@/lib/integrations/webconnex-api-client";
import { ContactSyncService } from "@/lib/integrations/contact-sync-service";
import { DonationSyncService } from "@/lib/integrations/donation-sync-service";
import {
  IntegrationSyncRunMode,
  IntegrationSyncStateService
} from "@/lib/integrations/integration-sync-state-service";
import {
  GIVINGFUEL_API_HEADER_NAME,
  GIVINGFUEL_CUSTOMERS_PATH,
  GIVINGFUEL_DEFAULT_PAGE_LIMIT,
  GIVINGFUEL_FORMS_PATH,
  GIVINGFUEL_INTEGRATION_KEY,
  GIVINGFUEL_PRODUCT_VALUE,
  GIVINGFUEL_TRANSACTIONS_PATH
} from "@/lib/integrations/givingfuel-contacts-config";
import { decryptIntegrationSecret } from "@/lib/integrations/secrets";

type SyncExecutionResult = {
  jobId: string;
  status: "completed" | "failed" | "completed_with_errors";
  recordsRetrieved: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  pagingComplete: boolean;
  completedSuccessfully: boolean;
  errorSummary?: string | null;
};

function resolveApiKey(connection: IntegrationConnection) {
  const configuration = (connection.configuration_json ?? {}) as Record<string, unknown>;
  const encryptedApiKey = configuration.encryptedApiKey;
  if (typeof encryptedApiKey === "string" && encryptedApiKey.trim()) {
    try {
      return decryptIntegrationSecret(encryptedApiKey).trim();
    } catch {
      return "";
    }
  }
  const specific = process.env.WEBCONNEX_API_KEY;
  if (specific) return specific.trim();
  if (!connection.api_key_reference) return "";
  return (process.env[connection.api_key_reference] ?? "").trim();
}

export class WebconnexSyncService {
  private logService = new IntegrationLogService();
  private contactSyncService = new ContactSyncService();
  private donationSyncService = new DonationSyncService();
  private syncStateService = new IntegrationSyncStateService();

  private buildClient(connection: IntegrationConnection, apiKeyOverride?: string) {
    const config = connection.configuration_json ?? {};
    const retry = connection.retry_settings ?? {};
    const resolvedApiKey = apiKeyOverride?.trim() || resolveApiKey(connection);
    const authHeaderName = String(config.authHeaderName ?? GIVINGFUEL_API_HEADER_NAME).trim();
    return new WebconnexApiClient({
      baseUrl: (connection.base_url ?? "").trim(),
      authType: connection.auth_type,
      apiKey: resolvedApiKey,
      apiKeyReference: connection.api_key_reference,
      authHeaderName: authHeaderName || GIVINGFUEL_API_HEADER_NAME,
      staticQueryParams: (config.staticQueryParams as Record<
        string,
        string | number | boolean
      >) ?? { product: GIVINGFUEL_PRODUCT_VALUE },
      timeoutMs: Number(connection.timeout_ms ?? 30000),
      maxRetries: Number(retry.maxRetries ?? 3),
      backoffMs: Number(retry.backoffMs ?? 1000),
      contactsPath: String(config.contactsPath ?? GIVINGFUEL_CUSTOMERS_PATH),
      transactionsPath: String(config.transactionsPath ?? GIVINGFUEL_TRANSACTIONS_PATH),
      formsPath: String(config.formsPath ?? GIVINGFUEL_FORMS_PATH),
      testPath: String(config.testPath ?? GIVINGFUEL_CUSTOMERS_PATH),
      defaultLimit: Number(config.defaultLimit ?? GIVINGFUEL_DEFAULT_PAGE_LIMIT)
    });
  }

  async testConnection(
    connection: IntegrationConnection,
    options?: { apiKeyOverride?: string; probeTransactions?: boolean }
  ) {
    const client = this.buildClient(connection, options?.apiKeyOverride);
    const result = await client.testConnection();
    if (!result.ok || !options?.probeTransactions) return result;
    try {
      await client.getTransactions({ limit: 1 });
      return {
        ok: true,
        message: "Connection test succeeded (contacts and donations endpoints reachable)."
      };
    } catch (transactionError) {
      return {
        ok: false,
        message:
          transactionError instanceof Error
            ? `Connection OK but donations read failed: ${transactionError.message}`
            : "Connection OK but donations read failed."
      };
    }
  }

  async detectDonationPages(input: {
    connection: IntegrationConnection;
    maxPages?: number;
    apiKeyOverride?: string;
  }) {
    const client = this.buildClient(input.connection, input.apiKeyOverride);
    const config = (input.connection.field_mapping_json ?? {}) as {
      donations?: { pageValue?: unknown };
    };
    const mappedPageField = config.donations?.pageValue;
    const maxPages =
      typeof input.maxPages === "number" && input.maxPages > 0
        ? Math.min(Math.floor(input.maxPages), 25)
        : 5;
    const detectedPages = new Set<string>();
    let cursor: string | null = null;
    let hasMore = true;
    let pages = 0;
    let transactions = 0;

    const pageKeys = Array.isArray(mappedPageField)
      ? mappedPageField.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : typeof mappedPageField === "string" && mappedPageField.trim()
        ? [mappedPageField.trim()]
        : [
            "Page Name",
            "page name",
            "formName",
            "form_name",
            "page",
            "page_name",
            "pageName",
            "PageName",
            "formId",
            "formAccRef",
            "campaign"
          ];

    // Preferred source: list all currently configured forms/pages in GivingFuel.
    try {
      const formRecords = await client.getForms({ limit: 500 });
      for (const record of formRecords) {
        const value = this.readRecordValue(record, [
          "Page Name",
          "formName",
          "name",
          "title",
          "displayName",
          "form_name",
          ...pageKeys
        ]);
        if (value) detectedPages.add(value);
      }
      if (detectedPages.size > 0) {
        return {
          detectedPages: Array.from(detectedPages).sort((a, b) => a.localeCompare(b)),
          pagesScanned: 1,
          transactionsScanned: 0
        };
      }
    } catch {
      // Fallback to transactions scan when forms endpoint is unavailable in tenant/environment.
    }

    while (hasMore && pages < maxPages) {
      pages += 1;
      const response = await client.getTransactions({
        limit: GIVINGFUEL_DEFAULT_PAGE_LIMIT,
        startingAfter: cursor
      });
      transactions += response.records.length;

      for (const record of response.records) {
        const value = this.readRecordValue(record, pageKeys) || this.findLikelyPageName(record);
        if (value) detectedPages.add(value);
      }

      const nextCursor = response.nextCursor;
      hasMore = response.hasMore && Boolean(nextCursor) && nextCursor !== cursor;
      cursor = nextCursor;
    }

    return {
      detectedPages: Array.from(detectedPages).sort((a, b) => a.localeCompare(b)),
      pagesScanned: pages,
      transactionsScanned: transactions
    };
  }

  private readRecordValue(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = this.readPath(record, key);
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
  }

  private findLikelyPageName(record: Record<string, unknown>) {
    for (const [key, rawValue] of Object.entries(record)) {
      if (typeof rawValue !== "string" || !rawValue.trim()) continue;
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.includes("page") && normalizedKey.includes("name")) {
        return rawValue.trim();
      }
      if (normalizedKey.includes("form") && normalizedKey.includes("name")) {
        return rawValue.trim();
      }
    }
    return "";
  }

  private readPath(record: Record<string, unknown>, path: string) {
    if (!path.includes(".")) return record[path];
    const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
    let current: unknown = record;
    for (const segment of segments) {
      if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  async runSync(input: {
    organizationId: string;
    userId: string;
    definition: IntegrationDefinition;
    connection: IntegrationConnection;
    scope: SyncScope;
    jobType: "manual" | "scheduled" | "retry_failed";
    syncRunMode?: IntegrationSyncRunMode;
  }): Promise<SyncExecutionResult> {
    const supabase = await createIntegrationClient();
    const syncSettings = { ...(input.connection.sync_settings_json ?? {}) };
    const isContactsStateManaged =
      input.definition.provider_key === GIVINGFUEL_INTEGRATION_KEY && input.scope === "contacts";
    let resolvedSyncRunMode: Exclude<IntegrationSyncRunMode, "auto"> = "incremental";
    let acquiredSyncState:
      | Awaited<ReturnType<IntegrationSyncStateService["acquireRun"]>>["state"]
      | null = null;

    if (isContactsStateManaged) {
      const acquired = await this.syncStateService.acquireRun({
        organizationId: input.organizationId,
        integrationConnectionId: input.connection.id,
        requestedMode: input.syncRunMode ?? "auto",
        syncScope: "contacts",
        userId: input.userId,
        statusMessage: "Preparing GivingFuel Contacts sync run."
      });
      acquiredSyncState = acquired.state;
      resolvedSyncRunMode = acquired.runMode;
    }

    let job;
    try {
      job = await this.logService.createJob({
        organizationId: input.organizationId,
        integrationConnectionId: input.connection.id,
        jobType: input.jobType,
        syncScope: input.scope,
        triggeredBy: input.userId,
        triggeredByType: input.jobType,
        syncRunMode: isContactsStateManaged ? resolvedSyncRunMode : "incremental"
      });
      if (acquiredSyncState) {
        acquiredSyncState = await this.syncStateService.attachJob({
          organizationId: input.organizationId,
          integrationConnectionId: input.connection.id,
          syncScope: "contacts",
          jobId: job.id,
          userId: input.userId
        });
      }
    } catch (createJobError) {
      if (acquiredSyncState) {
        await this.syncStateService.completeRun({
          organizationId: input.organizationId,
          integrationConnectionId: input.connection.id,
          syncScope: "contacts",
          runMode: resolvedSyncRunMode,
          success: false,
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
          statusMessage: "Failed to create integration sync job.",
          lastErrorMessage:
            createJobError instanceof Error
              ? createJobError.message
              : "Unable to create integration sync job.",
          userId: input.userId
        });
      }
      throw createJobError;
    }

    const client = this.buildClient(input.connection);
    let recordsProcessed = 0;
    let recordsRetrieved = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;
    let recordsFailed = 0;
    let status: "completed" | "failed" | "completed_with_errors" = "completed";
    let errorSummary: string | null = null;
    let finalCursor: string | null = null;
    let currentPage: number | null = 0;
    let totalRecordsExpected: number | null = null;
    let pagingComplete = true;
    let completionDetail = "Sync running.";
    let contactsResult: Awaited<ReturnType<ContactSyncService["run"]>> | null = null;

    await supabase
      .from("integration_connections")
      .update({
        sync_settings_json: {
          ...syncSettings,
          integrationRuntimeState: {
            syncStatus: "currently_working",
            runId: job.id,
            startedAt: job.started_date,
            completedAt: null,
            statusDetail: "Sync started.",
            recordsRetrieved: 0,
            recordsProcessed: 0,
            recordsCreated: 0,
            recordsUpdated: 0,
            recordsSkipped: 0,
            recordsFailed: 0,
            currentPage: 0,
            currentCursor: null,
            totalRecordsExpected: null,
            pagingComplete: false,
            completedSuccessfully: false,
            syncRunMode: isContactsStateManaged ? resolvedSyncRunMode : "incremental"
          }
        },
        updated_by: input.userId
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.connection.id);

    try {
      if (!input.connection.is_enabled && input.jobType === "scheduled") {
        throw new Error("Integration connection is disabled.");
      }

      if (!input.connection.base_url) {
        throw new Error("Base API URL is not configured.");
      }
      if (!resolveApiKey(input.connection)) {
        throw new Error(
          "GivingFuel API key is not configured. Enter API key and click Save / Connect before syncing."
        );
      }

      if (input.scope === "contacts" || input.scope === "all") {
        contactsResult = await this.contactSyncService.run({
          organizationId: input.organizationId,
          connection: input.connection,
          job,
          apiClient: client,
          logService: this.logService,
          runMode: isContactsStateManaged ? resolvedSyncRunMode : "incremental",
          incrementalCheckpoint: acquiredSyncState?.last_processed_checkpoint ?? null,
          onProgress: isContactsStateManaged
            ? async (progress) => {
                await this.syncStateService.updateProgress({
                  organizationId: input.organizationId,
                  integrationConnectionId: input.connection.id,
                  syncScope: "contacts",
                  recordsProcessed: progress.recordsProcessed,
                  recordsCreated: progress.recordsCreated,
                  recordsUpdated: progress.recordsUpdated,
                  recordsSkipped: progress.recordsSkipped,
                  recordsFailed: progress.recordsFailed,
                  totalRecordsExpected: progress.totalRecordsExpected,
                  currentPage: progress.currentPage,
                  currentBatch: progress.currentPage,
                  statusMessage: progress.statusMessage,
                  userId: input.userId
                });
              }
            : undefined
        });
        recordsRetrieved += contactsResult.retrieved;
        recordsProcessed += contactsResult.processed;
        recordsCreated += contactsResult.created;
        recordsUpdated += contactsResult.updated;
        recordsSkipped += contactsResult.skipped;
        recordsFailed += contactsResult.failed;
        finalCursor = contactsResult.cursor;
        pagingComplete = pagingComplete && contactsResult.pagingComplete;
        completionDetail = contactsResult.completionNote;
        currentPage = contactsResult.pagesProcessed;
        totalRecordsExpected = contactsResult.totalExpected;
        syncSettings.lastContactsSyncSummary = {
          pagesProcessed: contactsResult.pagesProcessed,
          retrieved: contactsResult.retrieved,
          processed: contactsResult.processed,
          created: contactsResult.created,
          updated: contactsResult.updated,
          failed: contactsResult.failed,
          skipped: contactsResult.skipped,
          pagingComplete: contactsResult.pagingComplete,
          completionNote: contactsResult.completionNote,
          runMode: isContactsStateManaged ? resolvedSyncRunMode : "incremental",
          nextCheckpoint: contactsResult.nextCheckpoint,
          finishedAt: new Date().toISOString()
        };
      }

      if (input.scope === "donations" || input.scope === "all") {
        const donationsResult = await this.donationSyncService.run({
          organizationId: input.organizationId,
          connection: input.connection,
          job,
          apiClient: client,
          logService: this.logService
        });
        recordsRetrieved += donationsResult.retrieved;
        recordsProcessed += donationsResult.processed;
        recordsCreated += donationsResult.created;
        recordsUpdated += donationsResult.updated;
        recordsSkipped += donationsResult.skipped;
        recordsFailed += donationsResult.failed;
        syncSettings.donationsCursor = donationsResult.cursor;
        finalCursor = donationsResult.cursor;
        pagingComplete = pagingComplete && donationsResult.pagingComplete;
        completionDetail = donationsResult.completionNote;
        currentPage =
          typeof currentPage === "number"
            ? currentPage + donationsResult.pagesProcessed
            : donationsResult.pagesProcessed;
        totalRecordsExpected = donationsResult.totalExpected;
        syncSettings.lastDonationsSyncSummary = {
          pagesProcessed: donationsResult.pagesProcessed,
          retrieved: donationsResult.retrieved,
          processed: donationsResult.processed,
          created: donationsResult.created,
          updated: donationsResult.updated,
          failed: donationsResult.failed,
          skipped: donationsResult.skipped,
          skippedDuplicates: donationsResult.skippedDuplicates,
          skippedUnmappedPages: donationsResult.skippedUnmappedPages,
          missingContactMatches: donationsResult.missingContactMatches,
          unmappedPageValues: donationsResult.unmappedPageValues,
          pagingComplete: donationsResult.pagingComplete,
          completionNote: donationsResult.completionNote,
          finishedAt: new Date().toISOString()
        };
      }

      status = recordsFailed > 0 || !pagingComplete ? "completed_with_errors" : "completed";
      if (status === "completed_with_errors") {
        if (recordsFailed > 0) {
          errorSummary = `${recordsFailed} record(s) failed during sync. Check Error Queue for details.`;
        } else {
          errorSummary = "Sync ended before processing all available pages/records.";
        }
      }
    } catch (error) {
      status = "failed";
      errorSummary = error instanceof Error ? error.message : "Webconnex sync failed.";
      recordsFailed += 1;
      pagingComplete = false;
      completionDetail = "Sync failed before completion.";
      await this.logService.enqueueError({
        organizationId: input.organizationId,
        integrationConnectionId: input.connection.id,
        jobId: job.id,
        entityType: "integration",
        payload: {
          scope: input.scope,
          jobType: input.jobType,
          syncRunMode: isContactsStateManaged ? resolvedSyncRunMode : "incremental"
        },
        errorMessage: errorSummary
      });

      await supabase
        .from("integration_connections")
        .update({
          connection_status: "failed",
          last_connection_test_date: new Date().toISOString(),
          last_connection_test_result: errorSummary,
          updated_by: input.userId
        })
        .eq("organization_id", input.organizationId)
        .eq("id", input.connection.id);
    }

    const completedSuccessfully = status === "completed" && pagingComplete && recordsFailed === 0;
    const successTimestamp = completedSuccessfully ? new Date().toISOString() : null;

    if (completedSuccessfully) {
      syncSettings.lastSuccessfulSyncDate = successTimestamp;
      if (isContactsStateManaged) {
        if (resolvedSyncRunMode === "full") {
          syncSettings.lastSuccessfulFullSyncDate = successTimestamp;
        } else {
          syncSettings.lastSuccessfulIncrementalSyncDate = successTimestamp;
        }
      }
      if (contactsResult?.cursor) {
        syncSettings.contactsCursor = contactsResult.cursor;
      }
    }

    await supabase
      .from("integration_connections")
      .update({
        sync_settings_json: syncSettings,
        connection_status:
          status === "failed"
            ? "failed"
            : completedSuccessfully
              ? "connected"
              : "connected_with_errors",
        updated_by: input.userId
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.connection.id);

    await this.logService.completeJob({
      organizationId: input.organizationId,
      jobId: job.id,
      status,
      recordsRetrieved,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      recordsSkipped,
      recordsFailed,
      totalRecordsExpected,
      currentPage,
      completedSuccessfully,
      pagingComplete,
      cursor: finalCursor,
      lastSuccessfulSyncDate: successTimestamp,
      errorSummary: errorSummary ?? completionDetail,
      startedDate: job.started_date
    });

    if (isContactsStateManaged) {
      await this.syncStateService.completeRun({
        organizationId: input.organizationId,
        integrationConnectionId: input.connection.id,
        syncScope: "contacts",
        runMode: resolvedSyncRunMode,
        success: completedSuccessfully,
        checkpoint: completedSuccessfully ? (contactsResult?.nextCheckpoint ?? successTimestamp) : null,
        totalRecordsExpected,
        currentPage,
        currentBatch: currentPage,
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        recordsSkipped,
        recordsFailed,
        statusMessage:
          completedSuccessfully
            ? resolvedSyncRunMode === "full"
              ? "Initial full sync completed successfully."
              : "Incremental sync completed successfully."
            : errorSummary ?? completionDetail,
        lastErrorMessage: completedSuccessfully ? null : errorSummary ?? completionDetail,
        userId: input.userId
      });
    }

    await supabase
      .from("integration_connections")
      .update({
        sync_settings_json: {
          ...syncSettings,
          integrationRuntimeState: {
            syncStatus:
              completedSuccessfully
                ? "fully_synced"
                : "could_not_complete",
            runId: job.id,
            startedAt: job.started_date,
            completedAt: new Date().toISOString(),
            statusDetail:
              completedSuccessfully
                ? "Completed all available pages/records."
                : errorSummary ?? completionDetail,
            recordsRetrieved,
            recordsProcessed,
            recordsCreated,
            recordsUpdated,
            recordsSkipped,
            recordsFailed,
            currentPage,
            currentCursor: finalCursor,
            totalRecordsExpected,
            pagingComplete,
            completedSuccessfully,
            syncRunMode: isContactsStateManaged ? resolvedSyncRunMode : "incremental"
          },
          lastSuccessfulSyncDate:
            completedSuccessfully
              ? successTimestamp
              : syncSettings.lastSuccessfulSyncDate ?? null
        },
        updated_by: input.userId
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.connection.id);

    return {
      jobId: job.id,
      status,
      recordsRetrieved,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      recordsSkipped,
      recordsFailed,
      pagingComplete,
      completedSuccessfully,
      errorSummary: errorSummary ?? completionDetail
    };
  }
}
