import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  IntegrationConnection,
  IntegrationDashboardItem,
  IntegrationErrorQueueItem,
  IntegrationSyncJob,
  SyncScope
} from "@/lib/integrations/types";
import { IntegrationRegistryService } from "@/lib/integrations/integration-registry-service";
import { IntegrationConfigurationService } from "@/lib/integrations/integration-configuration-service";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import { IntegrationJobRunner } from "@/lib/integrations/integration-job-runner";
import { IntegrationRetryService } from "@/lib/integrations/integration-retry-service";
import { WebconnexSyncService } from "@/lib/integrations/webconnex-sync-service";
import { createIntegrationClient } from "@/lib/integrations/db";
import { logAuditEvent } from "@/lib/data/audit";

const registryService = new IntegrationRegistryService();
const configurationService = new IntegrationConfigurationService();
const logService = new IntegrationLogService();
const jobRunner = new IntegrationJobRunner();
const retryService = new IntegrationRetryService();
const webconnexSyncService = new WebconnexSyncService();
const INTEGRATIONS_SCHEMA_ERROR_MESSAGE =
  "Integrations schema is not available in this environment yet. Run Supabase migration 202603130021 (and newer) and retry.";

function isMissingIntegrationsSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string };
  const text = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  if (
    candidate.code === "42P01" ||
    candidate.code === "42703" ||
    candidate.code === "PGRST205" ||
    candidate.code === "PGRST204"
  ) {
    return true;
  }
  return (
    (text.includes("does not exist") || text.includes("could not find")) &&
    (text.includes("integration_") ||
      text.includes("contact_external_references") ||
      text.includes("donation_external_references") ||
      text.includes("integration connections") ||
      text.includes("integration definitions"))
  );
}

function createFallbackDetail(integrationKey: string, organizationId: string) {
  const now = new Date().toISOString();
  const name = integrationKey === "webconnex" ? "Webconnex" : integrationKey;
  const fallbackWebconnexBaseUrl =
    process.env.WEBCONNEX_BASE_URL ?? process.env.WEBCONNEX_API_BASE_URL ?? "";
  return {
    definition: {
      id: `fallback-${integrationKey}`,
      name,
      provider_key: integrationKey,
      description:
        integrationKey === "webconnex"
          ? "Webconnex API synchronization for contacts and donations/transactions."
          : "Integration metadata unavailable until migrations are applied.",
      category: "donations",
      is_active: true,
      supports_manual_sync: true,
      supports_scheduled_sync: true,
      supports_test_connection: true,
      created_at: now,
      updated_at: now
    },
    connection: {
      id: `fallback-${integrationKey}-connection`,
      organization_id: organizationId,
      integration_definition_id: `fallback-${integrationKey}`,
      name,
      base_url: fallbackWebconnexBaseUrl,
      auth_type: "api_key_header",
      api_key_reference: "WEBCONNEX_API_KEY",
      is_enabled: false,
      connection_status: "not_tested",
      last_connection_test_date: null,
      last_connection_test_result: INTEGRATIONS_SCHEMA_ERROR_MESSAGE,
      timeout_ms: 30000,
      retry_settings: { maxRetries: 3, backoffMs: 1000 },
      debug_logging_enabled: false,
      configuration_json: {
        contactsPath: "/contacts",
        transactionsPath: "/transactions",
        testPath: "/health",
        authHeaderName: "Authorization"
      },
      sync_settings_json: {
        syncMode: "manual_and_scheduled",
        scheduleFrequency: "daily",
        contactSyncEnabled: true,
        donationSyncEnabled: true,
        fullSyncEnabled: true,
        incrementalSyncEnabled: true,
        fallbackContactMatch: "email_if_configured",
        initialImportStartDate: null,
        lastSuccessfulSyncDate: null
      },
      field_mapping_json: {
        contacts: {},
        donations: {}
      },
      created_by: null,
      updated_by: null,
      created_at: now,
      updated_at: now
    },
    jobs: [],
    errors: [],
    overview: {
      integrationName: name,
      description:
        "Integration framework is installed in code, but database migration is pending in this environment.",
      currentStatus: "Disabled",
      connectionStatus: "Not Tested",
      lastSuccessfulSync: null,
      lastFailedSync: null,
      lastSyncDurationMs: null,
      totalContactsSynced: 0,
      totalDonationsSynced: 0,
      failedRecordsCount: 0
    },
    schemaWarning: INTEGRATIONS_SCHEMA_ERROR_MESSAGE
  };
}

function buildSchemaFreeWebconnexConnection(organizationId: string): IntegrationConnection {
  const now = new Date().toISOString();
  const fallbackWebconnexBaseUrl =
    process.env.WEBCONNEX_BASE_URL ?? process.env.WEBCONNEX_API_BASE_URL ?? "";
  return {
    id: "schema-free-webconnex-connection",
    organization_id: organizationId,
    integration_definition_id: "schema-free-webconnex-definition",
    name: "Webconnex",
    base_url: fallbackWebconnexBaseUrl,
    auth_type: "api_key_header",
    api_key_reference: "WEBCONNEX_API_KEY",
    is_enabled: true,
    connection_status: "not_tested",
    last_connection_test_date: null,
    last_connection_test_result: null,
    timeout_ms: 30000,
    retry_settings: { maxRetries: 3, backoffMs: 1000 },
    debug_logging_enabled: false,
    configuration_json: {
      contactsPath: "/contacts",
      transactionsPath: "/transactions",
      testPath: "/health",
      authHeaderName: "Authorization"
    },
    sync_settings_json: {
      syncMode: "manual_and_scheduled",
      scheduleFrequency: "daily",
      contactSyncEnabled: true,
      donationSyncEnabled: true,
      fullSyncEnabled: true,
      incrementalSyncEnabled: true,
      fallbackContactMatch: "email_if_configured"
    },
    field_mapping_json: { contacts: {}, donations: {} },
    created_by: null,
    updated_by: null,
    created_at: now,
    updated_at: now
  };
}

async function requireIntegrationsAdmin() {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const permissionChecks = await Promise.all(
    [
      "can_manage_integrations",
      "can_manage_users",
      "can_manage_org_settings",
      "can_manage_role_templates"
    ].map(async (permission) => {
      const { data, error } = await supabase.rpc("has_permission", {
        org_id: context.organizationId,
        permission_key: permission
      });
      return !error && Boolean(data);
    })
  );

  if (permissionChecks.some(Boolean)) {
    return context;
  }

  try {
    const { data: roleKey } = await supabase.rpc("user_role_key", {
      org_id: context.organizationId
    });
    const normalizedRole = String(roleKey ?? "").toLowerCase();
    if (["administrator", "executive_leader", "executive_staff"].includes(normalizedRole)) {
      return context;
    }
  } catch {
    // Keep permission checks as primary guard; ignore role RPC failures.
  }

  redirect("/unauthorized");
}

async function getDefinitionAndConnection(organizationId: string, userId: string, key: string) {
  const definition = await registryService.getDefinition(key);
  if (!definition) throw new Error(`Integration ${key} not found.`);
  const connection = await configurationService.ensureConnection(
    organizationId,
    userId,
    definition
  );
  return { definition, connection };
}

function summarizeLastResult(job: IntegrationSyncJob | null) {
  if (!job) return "Never run";
  if (job.status === "failed") return "Failed";
  if (job.status === "completed_with_errors") return "Completed with errors";
  if (job.status === "completed") return "Success";
  return job.status;
}

export async function listIntegrationsForAdmin() {
  const context = await requireIntegrationsAdmin();
  try {
    const definitions = await registryService.listDefinitions();
    const rows: IntegrationDashboardItem[] = [];
    for (const definition of definitions) {
      const connection = await configurationService.ensureConnection(
        context.organizationId,
        context.userId,
        definition
      );
      const jobs = await logService.listJobs(context.organizationId, connection.id);
      rows.push({
        definition,
        connection,
        lastJob: jobs[0] ?? null
      });
    }

    const failedJobs = rows.filter((row) => row.lastJob?.status === "failed").length;
    const enabled = rows.filter((row) => row.connection?.is_enabled).length;
    const last24hActivity = rows.reduce((acc, row) => {
      const started = row.lastJob?.started_date;
      if (!started) return acc;
      return new Date(started).getTime() > Date.now() - 24 * 60 * 60 * 1000 ? acc + 1 : acc;
    }, 0);

    return {
      integrations: rows.map((row) => ({
        integrationKey: row.definition.provider_key,
        name: row.definition.name,
        providerType: row.definition.category,
        description: row.definition.description,
        status: row.connection?.is_enabled ? "Enabled" : "Disabled",
        connectionStatus: row.connection?.connection_status ?? "Not Tested",
        lastSyncDate: row.lastJob?.completed_date ?? null,
        lastSyncResult: summarizeLastResult(row.lastJob),
        isEnabled: Boolean(row.connection?.is_enabled)
      })),
      summary: {
        totalIntegrations: rows.length,
        enabledIntegrations: enabled,
        failedJobs,
        last24hSyncActivity: last24hActivity
      }
    };
  } catch (error) {
    if (!isMissingIntegrationsSchemaError(error)) throw error;
    return {
      integrations: [
        {
          integrationKey: "webconnex",
          name: "Webconnex",
          providerType: "donations",
          description:
            "Webconnex API synchronization is available after migration 202603130021 is applied.",
          status: "Disabled",
          connectionStatus: "Not Tested",
          lastSyncDate: null,
          lastSyncResult: "Migration required",
          isEnabled: false
        }
      ],
      summary: {
        totalIntegrations: 1,
        enabledIntegrations: 0,
        failedJobs: 0,
        last24hSyncActivity: 0
      },
      schemaWarning: INTEGRATIONS_SCHEMA_ERROR_MESSAGE
    };
  }
}

export async function getIntegrationDetailForAdmin(integrationKey: string) {
  const context = await requireIntegrationsAdmin();
  try {
    const { definition, connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    const jobs = await logService.listJobs(context.organizationId, connection.id);
    const errors = await logService.listErrors(context.organizationId, connection.id);

    const lastSuccess = jobs.find(
      (job) => job.status === "completed" || job.status === "completed_with_errors"
    );
    const lastFailure = jobs.find((job) => job.status === "failed");

    return {
      definition,
      connection,
      jobs,
      errors,
      overview: {
        integrationName: definition.name,
        description: definition.description,
        currentStatus: connection.is_enabled ? "Enabled" : "Disabled",
        connectionStatus: connection.connection_status,
        lastSuccessfulSync: lastSuccess?.completed_date ?? null,
        lastFailedSync: lastFailure?.completed_date ?? null,
        lastSyncDurationMs: jobs[0]?.duration_ms ?? null,
        totalContactsSynced: jobs.reduce(
          (sum, job) =>
            sum +
            (job.sync_scope === "contacts" || job.sync_scope === "all"
              ? job.records_processed
              : 0),
          0
        ),
        totalDonationsSynced: jobs.reduce(
          (sum, job) =>
            sum +
            (job.sync_scope === "donations" || job.sync_scope === "all"
              ? job.records_processed
              : 0),
          0
        ),
        failedRecordsCount: jobs.reduce(
          (sum, job) => sum + Number(job.records_failed ?? 0),
          0
        )
      }
    };
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      return createFallbackDetail(integrationKey, context.organizationId);
    }
    if (error instanceof Error && error.message.includes("Integration")) {
      return createFallbackDetail(integrationKey, context.organizationId);
    }
    throw error;
  }
}

export async function updateIntegrationConfiguration(
  integrationKey: string,
  payload: {
    name?: string;
    baseUrl?: string;
    authType?: string;
    apiKeyReference?: string;
    isEnabled?: boolean;
    timeoutMs?: number;
    retrySettings?: Record<string, unknown>;
    debugLoggingEnabled?: boolean;
    configuration?: Record<string, unknown>;
    syncSettings?: Record<string, unknown>;
    fieldMapping?: Record<string, unknown>;
  }
) {
  const context = await requireIntegrationsAdmin();
  try {
    const definition = await registryService.getDefinition(integrationKey);
    if (!definition) throw new Error("Integration not found.");
    const connection = await configurationService.upsertConfiguration({
      organizationId: context.organizationId,
      userId: context.userId,
      definition,
      payload
    });
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "integration_configuration_updated",
      targetEntityType: "integration_connections",
      targetEntityId: connection.id,
      metadata: { integrationKey }
    });
    return connection;
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
    }
    throw error;
  }
}

export async function testIntegrationConnection(integrationKey: string) {
  const context = await requireIntegrationsAdmin();
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    if (integrationKey !== "webconnex") {
      return { ok: false, message: `No test connector implemented for ${integrationKey}.` };
    }
    const result = await webconnexSyncService.testConnection(connection);
    const supabase = await createIntegrationClient();
    await supabase
      .from("integration_connections")
      .update({
        connection_status: result.ok ? "connected" : "failed",
        last_connection_test_date: new Date().toISOString(),
        last_connection_test_result: result.message,
        updated_by: context.userId
      })
      .eq("organization_id", context.organizationId)
      .eq("id", connection.id);
    return result;
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      if (integrationKey !== "webconnex") {
        throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
      }
      const schemaFreeConnection = buildSchemaFreeWebconnexConnection(context.organizationId);
      const result = await webconnexSyncService.testConnection(schemaFreeConnection);
      return {
        ...result,
        message: result.ok
          ? `${result.message} (schema-free mode: using environment-backed Webconnex configuration)`
          : `${result.message} (schema-free mode: set WEBCONNEX_BASE_URL/WEBCONNEX_API_BASE_URL and WEBCONNEX_API_KEY)`
      };
    }
    throw error;
  }
}

export async function runIntegrationSync(integrationKey: string, scope: SyncScope) {
  const context = await requireIntegrationsAdmin();
  try {
    const { definition, connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    const result = await jobRunner.run({
      organizationId: context.organizationId,
      userId: context.userId,
      definition,
      connection,
      scope,
      jobType: "manual"
    });
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "integration_manual_sync_run",
      targetEntityType: "integration_connections",
      targetEntityId: connection.id,
      metadata: { integrationKey, scope, ...result }
    });
    return result;
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
    }
    throw error;
  }
}

export async function retryFailedIntegrationSync(integrationKey: string) {
  const context = await requireIntegrationsAdmin();
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    const result = await retryService.retryFailed({
      organizationId: context.organizationId,
      userId: context.userId,
      integrationKey,
      connection
    });
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "integration_retry_failed_run",
      targetEntityType: "integration_connections",
      targetEntityId: connection.id,
      metadata: { integrationKey, result }
    });
    return result;
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
    }
    throw error;
  }
}

export async function listIntegrationJobs(integrationKey: string): Promise<IntegrationSyncJob[]> {
  const context = await requireIntegrationsAdmin();
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    return logService.listJobs(context.organizationId, connection.id);
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getIntegrationJob(
  integrationKey: string,
  jobId: string
): Promise<{ job: IntegrationSyncJob | null; logs: Array<Record<string, unknown>> }> {
  const context = await requireIntegrationsAdmin();
  try {
    await getDefinitionAndConnection(context.organizationId, context.userId, integrationKey);
    const job = await logService.getJob(context.organizationId, jobId);
    const logs = await logService.listJobLogs(context.organizationId, jobId);
    return { job, logs };
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      return { job: null, logs: [] };
    }
    throw error;
  }
}

export async function listIntegrationErrors(
  integrationKey: string
): Promise<IntegrationErrorQueueItem[]> {
  const context = await requireIntegrationsAdmin();
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    return logService.listErrors(context.organizationId, connection.id);
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function resolveIntegrationError(integrationKey: string, errorId: string) {
  const context = await requireIntegrationsAdmin();
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    const supabase = await createIntegrationClient();
    const { error } = await supabase
      .from("integration_error_queue")
      .update({
        status: "resolved",
        next_retry_date: null,
        last_retry_date: new Date().toISOString()
      })
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", connection.id)
      .eq("id", errorId);
    if (error) throw error;
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "integration_error_resolved",
      targetEntityType: "integration_error_queue",
      targetEntityId: errorId,
      metadata: { integrationKey }
    });
    return { ok: true };
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
    }
    throw error;
  }
}
