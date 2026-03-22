import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationJobRunner } from "@/lib/integrations/integration-job-runner";
import { IntegrationConnection, IntegrationDefinition } from "@/lib/integrations/types";
import {
  GIVINGFUEL_DONATIONS_INTEGRATION_KEY,
  GIVINGFUEL_INTEGRATION_KEY
} from "@/lib/integrations/givingfuel-contacts-config";
import { IntegrationSyncStateService } from "@/lib/integrations/integration-sync-state-service";

const SUPPORTED_PROVIDER_KEYS = new Set([
  GIVINGFUEL_INTEGRATION_KEY,
  GIVINGFUEL_DONATIONS_INTEGRATION_KEY
]);

function shouldRun(syncSettings: Record<string, unknown>, lastSuccessIso: string | null) {
  const mode = String(syncSettings.syncMode ?? "manual_and_scheduled");
  if (mode === "manual_only") return false;

  const frequency = String(syncSettings.scheduleFrequency ?? "daily");
  const lastSync = lastSuccessIso;
  if (!lastSync) return true;
  const diffMs = Date.now() - new Date(lastSync).getTime();
  if (frequency === "hourly") return diffMs >= 60 * 60 * 1000;
  if (frequency === "daily") return diffMs >= 24 * 60 * 60 * 1000;
  return true;
}

export class IntegrationSchedulerService {
  private runner = new IntegrationJobRunner();
  private syncStateService = new IntegrationSyncStateService();

  async runScheduledJobs() {
    const supabase = await createIntegrationClient();
    const { data: definitions, error: definitionError } = await supabase
      .from("integration_definitions")
      .select("*")
      .eq("is_active", true);
    if (definitionError) throw definitionError;
    const byId = new Map<string, IntegrationDefinition>();
    for (const definition of definitions ?? []) {
      byId.set(String(definition.id), definition as IntegrationDefinition);
    }

    const { data: connections, error } = await supabase
      .from("integration_connections")
      .select("*")
      .eq("is_enabled", true);
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    for (const connection of connections ?? []) {
      const syncSettings = (connection.sync_settings_json as Record<string, unknown>) ?? {};
      const definition = byId.get(String(connection.integration_definition_id));
      if (!definition) continue;
      if (!SUPPORTED_PROVIDER_KEYS.has(String(definition.provider_key ?? ""))) {
        continue;
      }
      const mode = String(syncSettings.syncMode ?? "manual_and_scheduled");
      if (mode === "manual_only") continue;

      const runningJobResult = await supabase
        .from("integration_sync_jobs")
        .select("id")
        .eq("organization_id", String(connection.organization_id))
        .eq("integration_connection_id", String(connection.id))
        .eq("status", "running")
        .is("completed_date", null)
        .limit(1);
      if (runningJobResult.error) throw runningJobResult.error;
      if ((runningJobResult.data ?? []).length > 0) {
        results.push({
          connectionId: connection.id,
          integrationKey: definition.provider_key,
          skipped: true,
          reason: "A sync job is already running for this connection."
        });
        continue;
      }

      const fallbackUser = String(connection.updated_by ?? connection.created_by ?? "");
      if (!fallbackUser) {
        results.push({
          connectionId: connection.id,
          integrationKey: definition.provider_key,
          skipped: true,
          reason: "No triggering user available for scheduled run."
        });
        continue;
      }

      try {
        let scheduledScope: "contacts" | "donations" | "all" =
          definition.provider_key === GIVINGFUEL_INTEGRATION_KEY
            ? "contacts"
            : definition.provider_key === GIVINGFUEL_DONATIONS_INTEGRATION_KEY
              ? "donations"
              : "all";
        let syncRunMode: "auto" | "full" | "incremental" = "auto";

        if (definition.provider_key === GIVINGFUEL_INTEGRATION_KEY) {
          const state = await this.syncStateService.ensureState({
            organizationId: String(connection.organization_id),
            integrationConnectionId: String(connection.id),
            syncScope: "contacts",
            userId: fallbackUser
          });
          if (state.sync_mode_status === "full_sync_in_progress" || state.sync_mode_status === "incremental_sync_in_progress") {
            results.push({
              connectionId: connection.id,
              integrationKey: definition.provider_key,
              skipped: true,
              reason: "Sync state is currently in progress."
            });
            continue;
          }
          if (state.sync_mode_status === "failed") {
            results.push({
              connectionId: connection.id,
              integrationKey: definition.provider_key,
              skipped: true,
              reason: "Sync state is failed. Run manually after reviewing errors."
            });
            continue;
          }

          const fullSyncEnabled = Boolean(syncSettings.fullSyncEnabled ?? true);
          const incrementalSyncEnabled = Boolean(syncSettings.incrementalSyncEnabled ?? true);
          if (!state.initial_full_sync_completed) {
            if (!fullSyncEnabled) {
              results.push({
                connectionId: connection.id,
                integrationKey: definition.provider_key,
                skipped: true,
                reason: "Initial full sync is required but full sync is disabled."
              });
              continue;
            }
            syncRunMode = "full";
          } else {
            if (!incrementalSyncEnabled) {
              results.push({
                connectionId: connection.id,
                integrationKey: definition.provider_key,
                skipped: true,
                reason: "Incremental sync is disabled."
              });
              continue;
            }
            syncRunMode = "incremental";
          }

          const lastScheduledSuccess =
            state.last_successful_incremental_sync_at ??
            state.last_successful_full_sync_at ??
            null;
          if (!shouldRun(syncSettings, lastScheduledSuccess)) {
            continue;
          }
        } else {
          const lastSyncIso = String(syncSettings.lastSuccessfulSyncDate ?? "").trim() || null;
          if (!shouldRun(syncSettings, lastSyncIso)) continue;
          scheduledScope = definition.provider_key === GIVINGFUEL_DONATIONS_INTEGRATION_KEY ? "donations" : "all";
          syncRunMode = "incremental";
        }

        const result = await this.runner.run({
          organizationId: String(connection.organization_id),
          userId: fallbackUser,
          definition,
          connection: connection as IntegrationConnection,
          scope: scheduledScope,
          jobType: "scheduled",
          syncRunMode
        });
        results.push({
          connectionId: connection.id,
          integrationKey: definition.provider_key,
          status: result.status,
          jobId: result.jobId,
          processed: result.recordsProcessed,
          syncRunMode
        });
      } catch (runError) {
        results.push({
          connectionId: connection.id,
          integrationKey: definition.provider_key,
          status: "failed",
          message: runError instanceof Error ? runError.message : "Scheduled sync failed."
        });
      }
    }
    return results;
  }
}
