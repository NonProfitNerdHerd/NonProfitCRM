import { Card, CardHeader } from "@/components/ui/card";
import { GivingFuelOperationsDashboard } from "@/components/givingfuel/giving-fuel-operations-dashboard";
import {
  getGivingFuelOperationalDashboard,
  getGivingFuelPageCampaignConfiguration,
  listGivingFuelWebhookInbox,
  listGivingFuelReviewQueue,
  requireGivingFuelOperationalAccess
} from "@/lib/data/givingfuel-webhook";

export default async function GivingFuelDataToolsPage() {
  await requireGivingFuelOperationalAccess();
  const [initialDashboard, initialReview, initialMappings, initialInbox] = await Promise.all([
    getGivingFuelOperationalDashboard(),
    listGivingFuelReviewQueue({}),
    getGivingFuelPageCampaignConfiguration(),
    listGivingFuelWebhookInbox({ limit: 50 })
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
        initialInbox={initialInbox}
      />
    </Card>
  );
}
