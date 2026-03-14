import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getProject } from "@/lib/data/projects";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listOrganizationUsers } from "@/lib/data/users";
import { ProjectManagementTabs } from "@/components/projects/project-management-tabs";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectManagementPage({ params }: PageProps) {
  await requireStaffPermission("can_view_dashboard");
  const { id } = await params;
  const [{ project, tasks, groupedTasks, staff, stakeholders }, users] = await Promise.all([
    getProject(id),
    listOrganizationUsers()
  ]);
  if (!project) notFound();

  return (
    <Card>
      <CardHeader
        title={`Project Management: ${project.name as string}`}
        subtitle="Overview, tasks, reporting, and stakeholder matrix"
      />
      <ProjectManagementTabs
        project={project as Record<string, unknown>}
        tasks={tasks as Array<Record<string, unknown>>}
        groupedTasks={groupedTasks as Record<string, Array<Record<string, unknown>>>}
        staff={staff as Array<Record<string, unknown>>}
        stakeholders={stakeholders as Array<Record<string, unknown>>}
        users={users.map((user) => ({ user_id: user.user_id, display_name: user.display_name }))}
      />
    </Card>
  );
}
