import { Card, CardHeader } from "@/components/ui/card";
import { GivingFuelOperationsDashboard } from "@/components/givingfuel/giving-fuel-operations-dashboard";
import {
  getGivingFuelOperationalDashboard,
  getGivingFuelPageCampaignConfiguration,
  listGivingFuelReviewQueue,
  requireGivingFuelOperationalAccess
} from "@/lib/data/givingfuel-webhook";

export default async function GivingFuelDataToolsPage() {
  await requireGivingFuelOperationalAccess();
  const [initialDashboard, initialReview, initialMappings] = await Promise.all([
    getGivingFuelOperationalDashboard(),
    listGivingFuelReviewQueue({}),
    getGivingFuelPageCampaignConfiguration()
  ]);
  return (
    <Card>
      <CardHeader
        title="Giving Fuel"
        subtitle="Webhook transaction intake, review queue, and import audit workflow"
      />
      <GivingFuelOperationsDashboard
        initialDashboard={initialDashboard}
        initialReview={initialReview}
        initialMappings={initialMappings}
      />
    </Card>
  );
}
