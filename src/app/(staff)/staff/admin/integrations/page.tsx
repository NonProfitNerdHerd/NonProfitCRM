import { Card, CardHeader } from "@/components/ui/card";
import { IntegrationsDashboard } from "@/components/admin/integrations/integrations-dashboard";
import { listIntegrationsForAdmin } from "@/lib/data/integrations";

export default async function IntegrationsPage() {
  let integrations: Array<{
    integrationKey: string;
    name: string;
    providerType: string;
    description: string | null;
    status: string;
    connectionStatus: string;
    lastSyncDate: string | null;
    lastSyncResult: string;
    isEnabled: boolean;
  }> = [];
  let summary = {
    totalIntegrations: 0,
    enabledIntegrations: 0,
    failedJobs: 0,
    last24hSyncActivity: 0
  };
  let loadError: string | null = null;

  try {
    const result = await listIntegrationsForAdmin();
    integrations = result.integrations;
    summary = result.summary;
    loadError = (result as { schemaWarning?: string }).schemaWarning ?? null;
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Integrations are temporarily unavailable in this environment.";
    integrations = [
      {
        integrationKey: "webconnex",
        name: "Giving Fuel",
        providerType: "Webconnex Product",
        description: "Fallback integration row while environment migrations settle.",
        status: "Disabled",
        connectionStatus: "Not Tested",
        lastSyncDate: null,
        lastSyncResult: "Unavailable",
        isEnabled: false
      }
    ];
    summary = {
      totalIntegrations: 1,
      enabledIntegrations: 0,
      failedJobs: 0,
      last24hSyncActivity: 0
    };
  }

  return (
    <Card>
      <CardHeader
        title="Integrations"
        subtitle="Manage third-party providers, connection settings, and sync operations"
      />
      {loadError ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {loadError}
        </p>
      ) : null}
      <IntegrationsDashboard initialIntegrations={integrations} summary={summary} />
    </Card>
  );
}
