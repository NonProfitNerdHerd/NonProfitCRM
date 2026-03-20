import { redirect } from "next/navigation";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function FinancialCampaignsPage() {
  await requireStaffPermission("can_view_donations");
  redirect("/staff/campaigns");
}
