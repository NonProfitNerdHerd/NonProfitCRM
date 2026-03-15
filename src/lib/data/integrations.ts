import { requireStaffPermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
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
import { logAuditEvent } from "@/lib/data/audit";

const registryService = new IntegrationRegistryService();
const configurationService = new IntegrationConfigurationService();
const logService = new IntegrationLogService();
const jobRunner = new IntegrationJobRunner();
const retryService = new IntegrationRetryService();
const webconnexSyncService = new WebconnexSyncService();

async function requireIntegrationsAdmin() {
  return requireStaffPermission("can_manage_integrations");
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
}

export async function getIntegrationDetailForAdmin(integrationKey: string) {
  const context = await requireIntegrationsAdmin();
  const { definition, connection } = await getDefinitionAndConnection(
    context.organizationId,
    context.userId,
    integrationKey
  );
  const jobs = await logService.listJobs(context.organizationId, connection.id);
  const errors = await logService.listErrors(context.organizationId, connection.id);

  const lastSuccess = jobs.find((job) => job.status === "completed" || job.status === "completed_with_errors");
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
      totalContactsSynced: jobs.reduce((sum, job) => sum + (job.sync_scope === "contacts" || job.sync_scope === "all" ? job.records_processed : 0), 0),
      totalDonationsSynced: jobs.reduce((sum, job) => sum + (job.sync_scope === "donations" || job.sync_scope === "all" ? job.records_processed : 0), 0),
      failedRecordsCount: jobs.reduce((sum, job) => sum + Number(job.records_failed ?? 0), 0)
    }
  };
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
}

export async function testIntegrationConnection(integrationKey: string) {
  const context = await requireIntegrationsAdmin();
  const { connection } = await getDefinitionAndConnection(
    context.organizationId,
    context.userId,
    integrationKey
  );
  if (integrationKey !== "webconnex") {
    return { ok: false, message: `No test connector implemented for ${integrationKey}.` };
  }
  const result = await webconnexSyncService.testConnection(connection);
  const supabase = await createClient();
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
}

export async function runIntegrationSync(integrationKey: string, scope: SyncScope) {
  const context = await requireIntegrationsAdmin();
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
}

export async function retryFailedIntegrationSync(integrationKey: string) {
  const context = await requireIntegrationsAdmin();
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
}

export async function listIntegrationJobs(integrationKey: string): Promise<IntegrationSyncJob[]> {
  const context = await requireIntegrationsAdmin();
  const { connection } = await getDefinitionAndConnection(
    context.organizationId,
    context.userId,
    integrationKey
  );
  return logService.listJobs(context.organizationId, connection.id);
}

export async function getIntegrationJob(
  integrationKey: string,
  jobId: string
): Promise<{ job: IntegrationSyncJob | null; logs: Array<Record<string, unknown>> }> {
  const context = await requireIntegrationsAdmin();
  await getDefinitionAndConnection(context.organizationId, context.userId, integrationKey);
  const job = await logService.getJob(context.organizationId, jobId);
  const logs = await logService.listJobLogs(context.organizationId, jobId);
  return { job, logs };
}

export async function listIntegrationErrors(
  integrationKey: string
): Promise<IntegrationErrorQueueItem[]> {
  const context = await requireIntegrationsAdmin();
  const { connection } = await getDefinitionAndConnection(
    context.organizationId,
    context.userId,
    integrationKey
  );
  return logService.listErrors(context.organizationId, connection.id);
}

export async function resolveIntegrationError(integrationKey: string, errorId: string) {
  const context = await requireIntegrationsAdmin();
  const { connection } = await getDefinitionAndConnection(
    context.organizationId,
    context.userId,
    integrationKey
  );
  const supabase = await createClient();
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
}
