import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { getProject } from "@/lib/data/projects";
import { requireStaffPermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({ params }: PageProps) {
  await requireStaffPermission("can_view_dashboard");
  const { id } = await params;
  const { project, tasks } = await getProject(id);
  if (!project) notFound();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={project.name} subtitle={project.description ?? "No description"} />
        <p className="text-xs text-slate-500">Status: {project.status}</p>
      </Card>
      <Card>
        <CardHeader title="Project Tasks" subtitle="Tasks associated with this project" />
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks in this project yet.</p>
          ) : (
            tasks.map((task) => {
              const contact = Array.isArray(task.contacts) ? task.contacts[0] : task.contacts;
              return (
                <Link
                  key={task.id}
                  href={`/staff/tasks/${task.id}`}
                  className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                    <span className="text-xs text-slate-500">{formatDate(task.due_date)}</span>
                  </div>
                  <p className="text-xs text-slate-600">{task.description ?? "-"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {task.status} • {task.priority}
                    {contact ? ` • ${contact.first_name} ${contact.last_name}` : ""}
                    {task.parent_task_id ? " • Subtask" : ""}
                  </p>
                </Link>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
