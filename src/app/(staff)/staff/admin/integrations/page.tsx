import { Card, CardHeader } from "@/components/ui/card";
import { IntegrationsDashboard } from "@/components/admin/integrations/integrations-dashboard";
import { listIntegrationsForAdmin } from "@/lib/data/integrations";

export default async function IntegrationsPage() {
  const { integrations, summary } = await listIntegrationsForAdmin();

  return (
    <Card>
      <CardHeader
        title="Integrations"
        subtitle="Manage third-party providers, connection settings, and sync operations"
      />
      <IntegrationsDashboard initialIntegrations={integrations} summary={summary} />
    </Card>
  );
}
