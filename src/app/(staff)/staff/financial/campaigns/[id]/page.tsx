import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/data/campaigns";
import { requireStaffPermission } from "@/lib/auth/guards";
import { CampaignDetailPanel } from "@/components/campaigns/campaign-detail-panel";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FinancialCampaignDetailPage({ params }: PageProps) {
  await requireStaffPermission("can_view_donations");
  const { id } = await params;
  const result = await getCampaign(id);
  const { campaign } = result;
  if (!campaign) notFound();

  return (
    <CampaignDetailPanel campaignId={id} initialData={result} />
  );
}
