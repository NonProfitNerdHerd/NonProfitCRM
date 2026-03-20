import { Card, CardHeader } from "@/components/ui/card";
import { GivingFuelOperationsDashboard } from "@/components/givingfuel/giving-fuel-operations-dashboard";
import { requireGivingFuelOperationalAccess } from "@/lib/data/givingfuel-webhook";

export default async function GivingFuelDataToolsPage() {
  await requireGivingFuelOperationalAccess();
  return (
    <Card>
      <CardHeader
        title="Giving Fuel"
        subtitle="Webhook transaction intake, review queue, and import audit workflow"
      />
      <GivingFuelOperationsDashboard />
    </Card>
  );
}
