import { Card, CardHeader } from "@/components/ui/card";
import { IntegrationsDashboard } from "@/components/admin/integrations/integrations-dashboard";
import { listIntegrationsForAdmin } from "@/lib/data/integrations";

export default async function IntegrationsPage() {
  let integrations: Array<{
    integrationKey: string;
    name: string;
  }> = [];
  let apiPaused = false;
  let loadError: string | null = null;

  try {
    const result = await listIntegrationsForAdmin();
    integrations = result.integrations.map((item) => ({
      integrationKey: item.integrationKey,
      name: item.name
    }));
    apiPaused = Boolean((result as { apiPaused?: boolean }).apiPaused);
    loadError = (result as { schemaWarning?: string }).schemaWarning ?? null;
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Integrations are temporarily unavailable in this environment.";
    integrations = [
      {
        integrationKey: "webconnex",
        name: "GivingFuel Contacts"
      }
    ];
    apiPaused = true;
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
      <IntegrationsDashboard initialIntegrations={integrations} apiPaused={apiPaused} />
    </Card>
  );
}
