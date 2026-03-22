import { IntegrationConnection, IntegrationDefinition, SyncScope } from "@/lib/integrations/types";
import { WebconnexSyncService } from "@/lib/integrations/webconnex-sync-service";
import { isGivingFuelIntegrationKey } from "@/lib/integrations/givingfuel-contacts-config";
import { IntegrationSyncRunMode } from "@/lib/integrations/integration-sync-state-service";

export class IntegrationJobRunner {
  private webconnexSyncService = new WebconnexSyncService();

  async run(input: {
    organizationId: string;
    userId: string;
    definition: IntegrationDefinition;
    connection: IntegrationConnection;
    scope: SyncScope;
    jobType: "manual" | "scheduled" | "retry_failed";
    syncRunMode?: IntegrationSyncRunMode;
  }) {
    if (isGivingFuelIntegrationKey(input.definition.provider_key)) {
      return this.webconnexSyncService.runSync(input);
    }
    throw new Error(`No sync runner is registered for integration ${input.definition.provider_key}.`);
  }
}
