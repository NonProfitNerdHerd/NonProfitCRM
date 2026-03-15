import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { formatCurrency } from "@/lib/utils";
import { dashboardTaskBuckets } from "@/lib/data/tasks";
import { listProjects } from "@/lib/data/projects";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { listMyNotifications } from "@/lib/data/notifications";
import { type NotificationItem } from "@/components/notifications/notifications-list";

export default async function StaffDashboardPage() {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const [
    { count: donorCount },
    { count: leadCount },
    { count: nonLeadCount },
    { count: donationCount },
    { data: donationTotal },
    buckets,
    projects,
    notifications
  ] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .eq("tracking_status", "donor"),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .eq("tracking_status", "lead"),
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .eq("tracking_status", "non_lead"),
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
      listProjects(),
      listMyNotifications()
    ]);

  const raised = (donationTotal ?? []).reduce(
    (sum, donation) => sum + Number(donation.amount),
    0
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader title="Donors" subtitle="Tracking Status: Donor" />
          <p className="text-3xl font-semibold">{donorCount ?? 0}</p>
        </Card>
        <Card>
          <CardHeader title="Leads" subtitle="Tracking Status: Lead" />
          <p className="text-3xl font-semibold">{leadCount ?? 0}</p>
        </Card>
        <Card>
          <CardHeader title="Non-Leads" subtitle="Tracking Status: Non-Lead" />
          <p className="text-3xl font-semibold">{nonLeadCount ?? 0}</p>
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
          title="Workspace"
          subtitle="Switch between My Tasks and Notifications"
        />
        <div>
          <DashboardTabs
            buckets={buckets}
            projects={projects}
            notifications={notifications as NotificationItem[]}
          />
        </div>
      </Card>
    </div>
  );
}
