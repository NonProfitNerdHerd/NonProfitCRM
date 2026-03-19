import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getTask } from "@/lib/data/tasks";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listOrganizationUsers } from "@/lib/data/users";
import { TaskEditor } from "@/components/tasks/task-editor";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string; contactId?: string }>;
};

export default async function TaskDetailPage({ params, searchParams }: PageProps) {
  await requireStaffPermission("can_view_dashboard");
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const [{ task, subtasks, comments }, users] = await Promise.all([
    getTask(id),
    listOrganizationUsers()
  ]);
  if (!task) notFound();
  const comingFromProfile = query.returnTo === "profile" && Boolean(query.contactId);
  const backHref = comingFromProfile
    ? `/staff/contacts/${String(query.contactId)}`
    : task.project_id
      ? `/staff/projects/management/${String(task.project_id)}?tab=tasks`
      : "/staff/projects/management";
  const backLabel = comingFromProfile ? "Back to Profile" : "Back to Project";

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {backLabel}
        </Link>
      </div>
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
