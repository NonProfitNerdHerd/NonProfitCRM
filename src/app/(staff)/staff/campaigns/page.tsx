import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listCampaigns, canCreateCampaigns } from "@/lib/data/campaigns";
import {
  CampaignsDashboard,
  type Campaign
} from "@/components/campaigns/campaigns-dashboard";
import { CampaignForm } from "@/components/forms/campaign-form";

export default async function CampaignsPage() {
  await requireStaffPermission("can_view_donations");
  const [campaigns, canCreate] = await Promise.all([
    listCampaigns({ status: "All" }),
    canCreateCampaigns()
  ]);

  return (
    <Card>
      <CardHeader
        title="Campaigns"
        subtitle="Manage active and inactive campaigns, and inspect related donations"
      />
      <CampaignsDashboard
        initialCampaigns={campaigns as Campaign[]}
        canCreate={canCreate}
        createForm={<CampaignForm />}
      />
    </Card>
  );
}
