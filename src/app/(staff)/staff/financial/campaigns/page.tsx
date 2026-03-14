import { Card } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listCampaigns, canCreateCampaigns } from "@/lib/data/campaigns";
import {
  CampaignsDashboard,
  type Campaign
} from "@/components/campaigns/campaigns-dashboard";

export default async function FinancialCampaignsPage() {
  await requireStaffPermission("can_view_donations");
  const [campaigns, canCreate] = await Promise.all([
    listCampaigns({ status: "All" }),
    canCreateCampaigns()
  ]);

  return (
    <Card>
      <CampaignsDashboard
        initialCampaigns={campaigns as Campaign[]}
        canCreate={canCreate}
      />
    </Card>
  );
}
