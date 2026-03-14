import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getTask } from "@/lib/data/tasks";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listOrganizationUsers } from "@/lib/data/users";
import { TaskEditor } from "@/components/tasks/task-editor";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TaskDetailPage({ params }: PageProps) {
  await requireStaffPermission("can_view_dashboard");
  const { id } = await params;
  const [{ task, subtasks, comments }, users] = await Promise.all([
    getTask(id),
    listOrganizationUsers()
  ]);
  if (!task) notFound();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={task.title} subtitle={task.description ?? "No description"} />
        <TaskEditor
          task={task as Record<string, unknown>}
          subtasks={subtasks as Array<Record<string, unknown>>}
          comments={comments as Array<Record<string, unknown>>}
          users={users}
        />
      </Card>
    </div>
  );
}
