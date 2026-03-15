import { IntegrationConnection, IntegrationDefinition, SyncScope } from "@/lib/integrations/types";
import { WebconnexSyncService } from "@/lib/integrations/webconnex-sync-service";

export class IntegrationJobRunner {
  private webconnexSyncService = new WebconnexSyncService();

  async run(input: {
    organizationId: string;
    userId: string;
    definition: IntegrationDefinition;
    connection: IntegrationConnection;
    scope: SyncScope;
    jobType: "manual" | "scheduled" | "retry_failed";
  }) {
    if (input.definition.provider_key === "webconnex") {
      return this.webconnexSyncService.runSync(input);
    }
    throw new Error(`No sync runner is registered for integration ${input.definition.provider_key}.`);
  }
}
