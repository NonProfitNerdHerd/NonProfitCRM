import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection } from "@/lib/integrations/types";
import { WebconnexSyncService } from "@/lib/integrations/webconnex-sync-service";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";

export class IntegrationRetryService {
  private syncService = new WebconnexSyncService();
  private logService = new IntegrationLogService();

  async retryFailed(input: {
    organizationId: string;
    userId: string;
    integrationKey: string;
    connection: IntegrationConnection;
  }) {
    if (input.integrationKey !== "webconnex") {
      throw new Error("Retry is currently supported for Webconnex only.");
    }

    const supabase = await createIntegrationClient();
    const errors = await this.logService.listErrors(input.organizationId, input.connection.id);
    const retryable = errors.filter((item) => item.status !== "resolved");
    if (retryable.length === 0) {
      return {
        retried: 0,
        message: "No retryable integration errors found."
      };
    }

    const result = await this.syncService.runSync({
      organizationId: input.organizationId,
      userId: input.userId,
      definition: {
        id: input.connection.integration_definition_id,
        name: "Webconnex",
        provider_key: "webconnex",
        description: "Webconnex API synchronization",
        category: "donations",
        is_active: true,
        supports_manual_sync: true,
        supports_scheduled_sync: true,
        supports_test_connection: true,
        created_at: input.connection.created_at,
        updated_at: input.connection.updated_at
      },
      connection: input.connection,
      scope: "all",
      jobType: "retry_failed"
    });

    await supabase
      .from("integration_error_queue")
      .update({
        status: "retried",
        last_retry_date: new Date().toISOString(),
        retry_count: 1
      })
      .eq("organization_id", input.organizationId)
      .eq("integration_connection_id", input.connection.id)
      .in(
        "id",
        retryable.map((item) => item.id)
      );

    return {
      retried: retryable.length,
      syncResult: result
    };
  }
}
