import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationDefinition, SyncScope } from "@/lib/integrations/types";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import { decryptIntegrationSecret } from "@/lib/integrations/secrets";
import { KindfulApiClient } from "@/lib/integrations/kindful-api-client";
import {
  KINDFUL_AUTH_HEADER_NAME,
  KINDFUL_AUTH_HEADER_PREFIX,
  KINDFUL_BASE_URL,
  KINDFUL_CONTACTS_QUERY_PATH,
  KINDFUL_DEFAULT_PAGE_SIZE,
  KINDFUL_IMPORT_STATUS_PATH_TEMPLATE,
  KINDFUL_SYNC_STATUS_PATH,
  KINDFUL_TRANSACTIONS_QUERY_PATH
} from "@/lib/integrations/kindful-config";
import { KindfulContactSyncService } from "@/lib/integrations/kindful-contact-sync-service";
import { KindfulTransactionSyncService } from "@/lib/integrations/kindful-transaction-sync-service";

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

function resolveApplicationToken(connection: IntegrationConnection) {
  const configuration = (connection.configuration_json ?? {}) as Record<string, unknown>;
  const encrypted = configuration.encryptedApiKey;
  if (typeof encrypted === "string" && encrypted.trim()) {
    try {
      return decryptIntegrationSecret(encrypted).trim();
    } catch {
      return "";
    }
  }
  const specific = process.env.KINDFUL_APPLICATION_TOKEN;
  if (specific) return specific.trim();
  if (!connection.api_key_reference) return "";
  return (process.env[connection.api_key_reference] ?? "").trim();
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y"].includes(normalized);
  }
  return false;
}

export class KindfulSyncService {
  private logService = new IntegrationLogService();
  private contactSyncService = new KindfulContactSyncService();
  private transactionSyncService = new KindfulTransactionSyncService();

  private buildClient(connection: IntegrationConnection, tokenOverride?: string) {
    const config = (connection.configuration_json ?? {}) as Record<string, unknown>;
    const retry = (connection.retry_settings ?? {}) as Record<string, unknown>;
    return new KindfulApiClient({
      baseUrl: String(connection.base_url ?? KINDFUL_BASE_URL),
      authType: connection.auth_type,
      applicationToken: tokenOverride?.trim() || resolveApplicationToken(connection),
      timeoutMs: Number(connection.timeout_ms ?? 30000),
      maxRetries: Number(retry.maxRetries ?? 3),
      backoffMs: Number(retry.backoffMs ?? 1000),
      requestIntervalMs: Number(config.requestIntervalMs ?? 200),
      contactsQueryPath: String(config.contactsQueryPath ?? KINDFUL_CONTACTS_QUERY_PATH),
      transactionsQueryPath: String(config.transactionsQueryPath ?? KINDFUL_TRANSACTIONS_QUERY_PATH),
      syncStatusPath: String(config.syncStatusPath ?? KINDFUL_SYNC_STATUS_PATH),
      importStatusPathTemplate: String(
        config.importStatusPathTemplate ?? KINDFUL_IMPORT_STATUS_PATH_TEMPLATE
      ),
      orgDetailsPath: String(config.orgDetailsPath ?? config.syncStatusPath ?? KINDFUL_SYNC_STATUS_PATH),
      authHeaderName: String(config.authHeaderName ?? KINDFUL_AUTH_HEADER_NAME),
      authHeaderPrefix: String(config.authHeaderPrefix ?? KINDFUL_AUTH_HEADER_PREFIX),
      pageSize: Number(config.pageSize ?? KINDFUL_DEFAULT_PAGE_SIZE)
    });
  }

  async testConnection(connection: IntegrationConnection, options?: { tokenOverride?: string }) {
    const client = this.buildClient(connection, options?.tokenOverride);
    return client.testConnection();
  }

  async runSync(input: {
    organizationId: string;
    userId: string;
    definition: IntegrationDefinition;
    connection: IntegrationConnection;
    scope: SyncScope;
    jobType: "manual" | "scheduled" | "retry_failed";
  }): Promise<SyncExecutionResult> {
    const supabase = await createIntegrationClient();
    const job = await this.logService.createJob({
      organizationId: input.organizationId,
      integrationConnectionId: input.connection.id,
      jobType: input.jobType,
      syncScope: input.scope,
      triggeredBy: input.userId,
      triggeredByType: input.jobType
    });

    const syncSettings = { ...(input.connection.sync_settings_json ?? {}) };
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
            statusDetail: "Kindful sync started.",
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
            completedSuccessfully: false
          }
        },
        updated_by: input.userId
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.connection.id);

    try {
      if (!input.connection.is_enabled && input.jobType === "scheduled") {
        throw new Error("Kindful integration is disabled.");
      }
      if (!input.connection.base_url) {
        throw new Error("Kindful base URL is not configured.");
      }
      if (!resolveApplicationToken(input.connection)) {
        throw new Error(
          "Kindful Application Token is not configured. Save token before running sync."
        );
      }

      const client = this.buildClient(input.connection);
      const syncStatus = await client.getSyncStatus().catch(() => null);
      if (syncStatus && normalizeBoolean(syncStatus.sync_enabled) === false) {
        status = "completed_with_errors";
        pagingComplete = false;
        completionDetail =
          "Kindful sync readiness indicates sync_enabled=false. Delaying processing until Kindful is ready.";
        errorSummary = completionDetail;
      } else {
        if (input.scope === "contacts" || input.scope === "all") {
          const contactsResult = await this.contactSyncService.run({
            organizationId: input.organizationId,
            connection: input.connection,
            job,
            apiClient: client,
            logService: this.logService
          });
          recordsRetrieved += contactsResult.retrieved;
          recordsProcessed += contactsResult.processed;
          recordsCreated += contactsResult.created;
          recordsUpdated += contactsResult.updated;
          recordsSkipped += contactsResult.skipped;
          recordsFailed += contactsResult.failed;
          finalCursor = contactsResult.queryToken;
          pagingComplete = pagingComplete && contactsResult.pagingComplete;
          totalRecordsExpected = contactsResult.totalExpected;
          currentPage = contactsResult.pagesProcessed;
          completionDetail = contactsResult.completionNote;
          syncSettings.kindfulContactsQueryToken = contactsResult.queryToken;
          syncSettings.kindfulLastContactsSyncDate = new Date().toISOString();
          syncSettings.kindfulLastContactsSummary = {
            mode: syncSettings.kindfulContactsMode ?? "incremental",
            pagesProcessed: contactsResult.pagesProcessed,
            retrieved: contactsResult.retrieved,
            processed: contactsResult.processed,
            created: contactsResult.created,
            updated: contactsResult.updated,
            failed: contactsResult.failed,
            skipped: contactsResult.skipped,
            reviewQueued: contactsResult.reviewQueued,
            pagingComplete: contactsResult.pagingComplete,
            completionNote: contactsResult.completionNote,
            finishedAt: new Date().toISOString()
          };
        }

        if (input.scope === "donations" || input.scope === "all") {
          const transactionsResult = await this.transactionSyncService.run({
            organizationId: input.organizationId,
            connection: input.connection,
            job,
            apiClient: client,
            logService: this.logService
          });
          recordsRetrieved += transactionsResult.retrieved;
          recordsProcessed += transactionsResult.processed;
          recordsCreated += transactionsResult.created;
          recordsUpdated += transactionsResult.updated;
          recordsSkipped += transactionsResult.skipped;
          recordsFailed += transactionsResult.failed;
          finalCursor = transactionsResult.queryToken;
          pagingComplete = pagingComplete && transactionsResult.pagingComplete;
          totalRecordsExpected = transactionsResult.totalExpected;
          currentPage =
            typeof currentPage === "number"
              ? currentPage + transactionsResult.pagesProcessed
              : transactionsResult.pagesProcessed;
          completionDetail = transactionsResult.completionNote;
          syncSettings.kindfulTransactionsQueryToken = transactionsResult.queryToken;
          syncSettings.kindfulLastTransactionsSyncDate = new Date().toISOString();
          syncSettings.kindfulLastTransactionsSummary = {
            mode: syncSettings.kindfulTransactionsMode ?? "incremental",
            pagesProcessed: transactionsResult.pagesProcessed,
            retrieved: transactionsResult.retrieved,
            processed: transactionsResult.processed,
            created: transactionsResult.created,
            updated: transactionsResult.updated,
            failed: transactionsResult.failed,
            skipped: transactionsResult.skipped,
            reviewQueued: transactionsResult.reviewQueued,
            pagingComplete: transactionsResult.pagingComplete,
            completionNote: transactionsResult.completionNote,
            finishedAt: new Date().toISOString()
          };
        }
      }

      if (status !== "completed_with_errors") {
        status = recordsFailed > 0 || !pagingComplete ? "completed_with_errors" : "completed";
        if (status === "completed_with_errors") {
          errorSummary =
            recordsFailed > 0
              ? `${recordsFailed} record(s) failed during Kindful sync.`
              : "Kindful sync ended before processing all available pages/records.";
        }
      }

      await supabase
        .from("integration_connections")
        .update({
          sync_settings_json: {
            ...syncSettings,
            lastSuccessfulSyncDate: new Date().toISOString()
          },
          connection_status: status === "completed" ? "connected" : "connected_with_errors",
          updated_by: input.userId
        })
        .eq("organization_id", input.organizationId)
        .eq("id", input.connection.id);
    } catch (error) {
      status = "failed";
      errorSummary = error instanceof Error ? error.message : "Kindful sync failed.";
      recordsFailed += 1;
      pagingComplete = false;
      completionDetail = "Kindful sync failed before completion.";
      await this.logService.enqueueError({
        organizationId: input.organizationId,
        integrationConnectionId: input.connection.id,
        jobId: job.id,
        entityType: "integration",
        payload: { scope: input.scope, jobType: input.jobType },
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
      completedSuccessfully: status === "completed" && pagingComplete && recordsFailed === 0,
      pagingComplete,
      cursor: finalCursor,
      lastSuccessfulSyncDate:
        status === "completed" || status === "completed_with_errors"
          ? new Date().toISOString()
          : null,
      errorSummary: errorSummary ?? completionDetail,
      startedDate: job.started_date
    });

    await supabase
      .from("integration_connections")
      .update({
        sync_settings_json: {
          ...syncSettings,
          integrationRuntimeState: {
            syncStatus:
              status === "completed" && pagingComplete && recordsFailed === 0
                ? "fully_synced"
                : "could_not_complete",
            runId: job.id,
            startedAt: job.started_date,
            completedAt: new Date().toISOString(),
            statusDetail:
              status === "completed" && pagingComplete && recordsFailed === 0
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
            completedSuccessfully: status === "completed" && pagingComplete && recordsFailed === 0
          },
          lastSuccessfulSyncDate:
            status === "completed" || status === "completed_with_errors"
              ? new Date().toISOString()
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
      completedSuccessfully: status === "completed" && pagingComplete && recordsFailed === 0,
      errorSummary: errorSummary ?? completionDetail
    };
  }
}
