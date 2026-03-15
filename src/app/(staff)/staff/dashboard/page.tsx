import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { dashboardTaskBuckets } from "@/lib/data/tasks";
import { listProjects } from "@/lib/data/projects";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { listMyNotifications } from "@/lib/data/notifications";
import { type NotificationItem } from "@/components/notifications/notifications-list";

export default async function StaffDashboardPage() {
  await requireStaffPermission("can_view_dashboard");

  const [buckets, projects, notifications] = await Promise.all([
    dashboardTaskBuckets(),
    listProjects(),
    listMyNotifications()
  ]);
  const unreadNotifications = (notifications ?? []).filter(
    (notification) => String(notification.status ?? "").toLowerCase() === "unread"
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader title="Overdue Tasks" subtitle="Past due tasks assigned to me" />
          <p className="text-3xl font-semibold">{buckets.overdue.length}</p>
        </Card>
        <Card>
          <CardHeader title="My Upcoming Tasks" subtitle="Due in the next 30 days" />
          <p className="text-3xl font-semibold">{buckets.upcoming.length}</p>
        </Card>
        <Card>
          <CardHeader title="All Tasks" subtitle="Open tasks assigned to me" />
          <p className="text-3xl font-semibold">{buckets.allTasks.length}</p>
        </Card>
        <Card>
          <CardHeader
            title="Notifications Not Yet Reviewed"
            subtitle="Unread notifications assigned to me"
          />
          <p className="text-3xl font-semibold">{unreadNotifications}</p>
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
