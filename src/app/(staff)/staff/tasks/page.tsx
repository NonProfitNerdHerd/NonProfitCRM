import { Card, CardHeader } from "@/components/ui/card";
import { TasksPanel } from "@/components/tasks/tasks-panel";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function TasksPage() {
  await requireStaffPermission("can_view_dashboard");

  return (
    <Card>
      <CardHeader
        title="Tasks Panel"
        subtitle="Create tasks and subtasks, assign ownership, and filter by project/contact/status"
      />
      <TasksPanel />
    </Card>
  );
}
