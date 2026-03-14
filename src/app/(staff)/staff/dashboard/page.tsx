import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { formatCurrency } from "@/lib/utils";
import { dashboardTaskBuckets } from "@/lib/data/tasks";
import { listProjects } from "@/lib/data/projects";
import { MyTasksTabs as MyTaskTabsClient } from "@/components/dashboard/my-tasks-tabs";

export default async function StaffDashboardPage() {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const [
    { count: contactCount },
    { count: donationCount },
    { data: donationTotal },
    buckets,
    projects
  ] =
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
        .limit(1000),
      dashboardTaskBuckets(),
      listProjects()
    ]);

  const raised = (donationTotal ?? []).reduce(
    (sum, donation) => sum + Number(donation.amount),
    0
  );

  return (
    <div className="space-y-4">
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
      <Card>
        <CardHeader
          title="My Tasks"
          subtitle="Overdue, upcoming, open, and recently completed assignments"
        />
        <div>
          {/* Client tab control for personalized task workflow */}
          <MyTaskTabsClient buckets={buckets} projects={projects} />
        </div>
      </Card>
    </div>
  );
}
