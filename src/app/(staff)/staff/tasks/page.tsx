import { Card, CardHeader } from "@/components/ui/card";
import { MyTasksDashboard } from "@/components/tasks/my-tasks-dashboard";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listTasks } from "@/lib/data/tasks";
import { listProjects } from "@/lib/data/projects";

export default async function TasksPage() {
  const context = await requireStaffPermission("can_view_dashboard");
  const [tasks, projects] = await Promise.all([
    listTasks({ assignedTo: context.userId }),
    listProjects()
  ]);

  return (
    <Card>
      <CardHeader
        title="My Tasks"
        subtitle="Dashboard view of all tasks assigned to you, including timeline and calendar planning."
      />
      <MyTasksDashboard
        tasks={tasks as Array<{
          id: string;
          title: string;
          description: string | null;
          due_date: string | null;
          start_date: string | null;
          end_date: string | null;
          status: string;
          priority: string;
          completed_at: string | null;
          project_id: string | null;
        }>}
        projects={(projects ?? []).map((project) => ({
          id: String(project.id ?? ""),
          name: String(project.name ?? "-")
        }))}
      />
    </Card>
  );
}
