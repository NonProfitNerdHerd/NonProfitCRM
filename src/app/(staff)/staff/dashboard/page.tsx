import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { formatCurrency } from "@/lib/utils";

export default async function StaffDashboardPage() {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const [{ count: contactCount }, { count: donationCount }, { data: donationTotal }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", context.organizationId),
      supabase
        .from("donations")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", context.organizationId),
      supabase
        .from("donations")
        .select("amount")
        .eq("organization_id", context.organizationId)
        .limit(1000)
    ]);

  const raised = (donationTotal ?? []).reduce(
    (sum, donation) => sum + Number(donation.amount),
    0
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader title="Contacts" subtitle="Total constituent records" />
        <p className="text-3xl font-semibold">{contactCount ?? 0}</p>
      </Card>
      <Card>
        <CardHeader title="Donations" subtitle="Tracked transactions" />
        <p className="text-3xl font-semibold">{donationCount ?? 0}</p>
      </Card>
      <Card>
        <CardHeader title="Revenue" subtitle="Snapshot of imported and manual gifts" />
        <p className="text-3xl font-semibold">{formatCurrency(raised)}</p>
      </Card>
    </div>
  );
}
