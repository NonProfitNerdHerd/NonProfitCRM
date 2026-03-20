import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/auth/guards";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function FinancialCampaignDetailPage({ params }: PageProps) {
  await requireStaffPermission("can_view_donations");
  const { id } = await params;
  redirect(`/staff/campaigns/${encodeURIComponent(id)}`);
}
