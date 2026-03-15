import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationDefinition, SyncScope } from "@/lib/integrations/types";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import { WebconnexApiClient } from "@/lib/integrations/webconnex-api-client";
import { ContactSyncService } from "@/lib/integrations/contact-sync-service";
import { DonationSyncService } from "@/lib/integrations/donation-sync-service";
import {
  GIVINGFUEL_API_HEADER_NAME,
  GIVINGFUEL_CUSTOMERS_PATH,
  GIVINGFUEL_DEFAULT_PAGE_LIMIT,
  GIVINGFUEL_PRODUCT_VALUE
} from "@/lib/integrations/givingfuel-contacts-config";
import { decryptIntegrationSecret } from "@/lib/integrations/secrets";

type SyncExecutionResult = {
  jobId: string;
  status: "completed" | "failed" | "completed_with_errors";
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
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
      transactionsPath: String(config.transactionsPath ?? "/transactions"),
      testPath: String(config.testPath ?? GIVINGFUEL_CUSTOMERS_PATH),
      defaultLimit: Number(config.defaultLimit ?? GIVINGFUEL_DEFAULT_PAGE_LIMIT)
    });
  }

  async testConnection(connection: IntegrationConnection, options?: { apiKeyOverride?: string }) {
    const client = this.buildClient(connection, options?.apiKeyOverride);
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
    const client = this.buildClient(input.connection);
    let recordsProcessed = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsFailed = 0;
    let status: "completed" | "failed" | "completed_with_errors" = "completed";
    let errorSummary: string | null = null;

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
        const contactsResult = await this.contactSyncService.run({
          organizationId: input.organizationId,
          connection: input.connection,
          job,
          apiClient: client,
          logService: this.logService
        });
        recordsProcessed += contactsResult.processed;
        recordsCreated += contactsResult.created;
        recordsUpdated += contactsResult.updated;
        recordsFailed += contactsResult.failed;
        syncSettings.contactsCursor = contactsResult.cursor;
      }

      if (input.scope === "donations" || input.scope === "all") {
        const donationsResult = await this.donationSyncService.run({
          organizationId: input.organizationId,
          connection: input.connection,
          job,
          apiClient: client,
          logService: this.logService
        });
        recordsProcessed += donationsResult.processed;
        recordsCreated += donationsResult.created;
        recordsUpdated += donationsResult.updated;
        recordsFailed += donationsResult.failed;
        syncSettings.donationsCursor = donationsResult.cursor;
      }

      const now = new Date().toISOString();
      syncSettings.lastSuccessfulSyncDate = now;

      await supabase
        .from("integration_connections")
        .update({
          sync_settings_json: syncSettings,
          connection_status: recordsFailed > 0 ? "connected_with_errors" : "connected",
          updated_by: input.userId
        })
        .eq("organization_id", input.organizationId)
        .eq("id", input.connection.id);

      status = recordsFailed > 0 ? "completed_with_errors" : "completed";
    } catch (error) {
      status = "failed";
      errorSummary = error instanceof Error ? error.message : "Webconnex sync failed.";
      recordsFailed += 1;
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
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      recordsFailed,
      cursor: null,
      lastSuccessfulSyncDate:
        status === "completed" || status === "completed_with_errors"
          ? new Date().toISOString()
          : null,
      errorSummary,
      startedDate: job.started_date
    });

    return {
      jobId: job.id,
      status,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      recordsFailed,
      errorSummary
    };
  }
}
