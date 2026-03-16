import { IntegrationConnection, IntegrationDefinition, SyncScope } from "@/lib/integrations/types";
import { WebconnexSyncService } from "@/lib/integrations/webconnex-sync-service";
import { isGivingFuelIntegrationKey } from "@/lib/integrations/givingfuel-contacts-config";
import { isKindfulIntegrationKey } from "@/lib/integrations/kindful-config";
import { KindfulSyncService } from "@/lib/integrations/kindful-sync-service";

export class IntegrationJobRunner {
  private webconnexSyncService = new WebconnexSyncService();
  private kindfulSyncService = new KindfulSyncService();

  async run(input: {
    organizationId: string;
    userId: string;
    definition: IntegrationDefinition;
    connection: IntegrationConnection;
    scope: SyncScope;
    jobType: "manual" | "scheduled" | "retry_failed";
  }) {
    if (isGivingFuelIntegrationKey(input.definition.provider_key)) {
      return this.webconnexSyncService.runSync(input);
    }
    if (isKindfulIntegrationKey(input.definition.provider_key)) {
      return this.kindfulSyncService.runSync(input);
    }
    throw new Error(`No sync runner is registered for integration ${input.definition.provider_key}.`);
  }
}
