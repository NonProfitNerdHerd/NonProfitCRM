import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getProject } from "@/lib/data/projects";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listOrganizationUsers } from "@/lib/data/users";
import { ProjectManagementTabs } from "@/components/projects/project-management-tabs";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function ProjectManagementPage({ params, searchParams }: PageProps) {
  await requireStaffPermission("can_view_dashboard");
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
      projectExpenses,
      taskDependencies,
      dashboard,
      guardrails,
      warnings
    },
    users
  ] = await Promise.all([
    getProject(id),
    listOrganizationUsers()
  ]);
  if (!project) notFound();

  return (
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
        projectExpenses={(projectExpenses ?? []) as Array<Record<string, unknown>>}
        taskDependencies={(taskDependencies ?? []) as Array<Record<string, unknown>>}
        dashboard={dashboard ?? {}}
        guardrails={guardrails ?? {}}
        warnings={(warnings ?? []) as string[]}
        initialWorkspaceTab={query.tab}
        users={users.map((user) => ({ user_id: user.user_id, display_name: user.display_name }))}
      />
    </Card>
  );
}
