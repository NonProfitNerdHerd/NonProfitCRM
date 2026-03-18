import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getProject } from "@/lib/data/projects";
import { listTasks } from "@/lib/data/tasks";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listOrganizationUsers } from "@/lib/data/users";
import { ProjectManagementTabs } from "@/components/projects/project-management-tabs";
import { MyTasksSideRail, type MyTasksSideRailItem } from "@/components/tasks/my-tasks-side-rail";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function ProjectManagementPage({ params, searchParams }: PageProps) {
  const context = await requireStaffPermission("can_view_dashboard");
  const { id } = await params;
  const query = await searchParams;
  const [
    {
      project,
      tasks,
      groupedTasks,
      staff,
      stakeholders,
      scope,
      scopeChanges,
      milestones,
      risks,
      budget,
      resources,
      decisionLog,
      updates,
      review,
      closeoutNotes,
      projectExpenses,
      dashboard,
      guardrails,
      warnings
    },
    users,
    myTasks
  ] = await Promise.all([
    getProject(id),
    listOrganizationUsers(),
    listTasks({ assignedTo: context.userId })
  ]);
  if (!project) notFound();
  const myAssignedTasks = (myTasks as Array<Record<string, unknown>>)
    .map((task) => ({
      id: String(task.id ?? ""),
      title: (task.title as string | null | undefined) ?? null,
      due_date: (task.due_date as string | null | undefined) ?? null,
      status: (task.status as string | null | undefined) ?? null,
      completed_at: (task.completed_at as string | null | undefined) ?? null,
      parent_task_id: (task.parent_task_id as string | null | undefined) ?? null,
      project_id: (task.project_id as string | null | undefined) ?? null,
      project_name: ((task.projects as { name?: string } | null | undefined)?.name ?? null) as string | null
    }))
    .filter((task) => task.id.length > 0) as MyTasksSideRailItem[];

  return (
    <>
      <div className="pr-24 md:pr-28">
        <Card>
          <CardHeader
            title={`Project Management: ${project.name as string}`}
            subtitle="Guided lifecycle workspace with intake, planning, execution guardrails, monitoring, and closure review."
          />
          <ProjectManagementTabs
            project={project as Record<string, unknown>}
            tasks={tasks as Array<Record<string, unknown>>}
            groupedTasks={groupedTasks as Record<string, Array<Record<string, unknown>>>}
            staff={staff as Array<Record<string, unknown>>}
            stakeholders={stakeholders as Array<Record<string, unknown>>}
            scope={(scope ?? null) as Record<string, unknown> | null}
            scopeChanges={(scopeChanges ?? []) as Array<Record<string, unknown>>}
            milestones={(milestones ?? []) as Array<Record<string, unknown>>}
            risks={(risks ?? []) as Array<Record<string, unknown>>}
            budget={(budget ?? null) as Record<string, unknown> | null}
            resources={(resources ?? []) as Array<Record<string, unknown>>}
            decisionLog={(decisionLog ?? []) as Array<Record<string, unknown>>}
            updates={(updates ?? []) as Array<Record<string, unknown>>}
            review={(review ?? null) as Record<string, unknown> | null}
            closeoutNotes={(closeoutNotes ?? []) as Array<Record<string, unknown>>}
            projectExpenses={(projectExpenses ?? []) as Array<Record<string, unknown>>}
            dashboard={dashboard ?? {}}
            guardrails={guardrails ?? {}}
            warnings={(warnings ?? []) as string[]}
            initialWorkspaceTab={query.tab}
            users={users.map((user) => ({ user_id: user.user_id, display_name: user.display_name }))}
          />
        </Card>
      </div>
      <MyTasksSideRail tasks={myAssignedTasks} />
    </>
  );
}
