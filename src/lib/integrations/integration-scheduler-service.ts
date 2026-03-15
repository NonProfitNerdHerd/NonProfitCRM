import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationJobRunner } from "@/lib/integrations/integration-job-runner";
import { IntegrationConnection, IntegrationDefinition } from "@/lib/integrations/types";
import {
  GIVINGFUEL_DONATIONS_INTEGRATION_KEY,
  GIVINGFUEL_INTEGRATION_KEY
} from "@/lib/integrations/givingfuel-contacts-config";

function shouldRun(syncSettings: Record<string, unknown>) {
  const mode = String(syncSettings.syncMode ?? "manual_and_scheduled");
  if (mode === "manual_only") return false;

  const frequency = String(syncSettings.scheduleFrequency ?? "daily");
  const lastSync = syncSettings.lastSuccessfulSyncDate as string | null | undefined;
  if (!lastSync) return true;
  const diffMs = Date.now() - new Date(lastSync).getTime();
  if (frequency === "hourly") return diffMs >= 60 * 60 * 1000;
  if (frequency === "daily") return diffMs >= 24 * 60 * 60 * 1000;
  return true;
}

export class IntegrationSchedulerService {
  private runner = new IntegrationJobRunner();

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
      if (!shouldRun(syncSettings)) continue;
      const definition = byId.get(String(connection.integration_definition_id));
      if (!definition) continue;

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
        const scheduledScope =
          definition.provider_key === GIVINGFUEL_INTEGRATION_KEY
            ? "contacts"
            : definition.provider_key === GIVINGFUEL_DONATIONS_INTEGRATION_KEY
              ? "donations"
              : "all";
        const result = await this.runner.run({
          organizationId: String(connection.organization_id),
          userId: fallbackUser,
          definition,
          connection: connection as IntegrationConnection,
          scope: scheduledScope,
          jobType: "scheduled"
        });
        results.push({
          connectionId: connection.id,
          integrationKey: definition.provider_key,
          status: result.status,
          jobId: result.jobId,
          processed: result.recordsProcessed
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
