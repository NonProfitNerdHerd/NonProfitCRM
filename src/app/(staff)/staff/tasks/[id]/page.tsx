import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getTask } from "@/lib/data/tasks";
import { requireStaffPermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TaskDetailPage({ params }: PageProps) {
  await requireStaffPermission("can_view_dashboard");
  const { id } = await params;
  const { task, subtasks } = await getTask(id);
  if (!task) notFound();

  const contact = Array.isArray(task.contacts) ? task.contacts[0] : task.contacts;
  const project = Array.isArray(task.projects) ? task.projects[0] : task.projects;
  const org = Array.isArray(task.crm_organizations)
    ? task.crm_organizations[0]
    : task.crm_organizations;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={task.title} subtitle={task.description ?? "No description"} />
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <p className="text-slate-500">Status</p>
            <p>{task.status}</p>
          </div>
          <div>
            <p className="text-slate-500">Priority</p>
            <p>{task.priority}</p>
          </div>
          <div>
            <p className="text-slate-500">Suspense Date</p>
            <p>{formatDate(task.due_date)}</p>
          </div>
          <div>
            <p className="text-slate-500">Assigned User</p>
            <p>{task.assigned_to ?? "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Related Contact</p>
            <p>{contact ? `${contact.first_name} ${contact.last_name}` : "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Related Project</p>
            <p>{project?.name ?? "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Related Organization</p>
            <p>{org?.name ?? "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Completed</p>
            <p>{formatDate(task.completed_at)}</p>
          </div>
          <div>
            <p className="text-slate-500">Parent Task</p>
            <p>{task.parent_task_id ?? "-"}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Subtasks" subtitle="Task breakdown and progress roll-up" />
        <div className="space-y-2">
          {subtasks.length === 0 ? (
            <p className="text-sm text-slate-500">No subtasks yet.</p>
          ) : (
            subtasks.map((subtask) => (
              <a
                key={subtask.id}
                href={`/staff/tasks/${subtask.id}`}
                className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
              >
                <p className="text-sm font-medium text-slate-900">{subtask.title}</p>
                <p className="text-xs text-slate-500">
                  {subtask.status} • {subtask.priority} • Due {formatDate(subtask.due_date)}
                </p>
              </a>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
