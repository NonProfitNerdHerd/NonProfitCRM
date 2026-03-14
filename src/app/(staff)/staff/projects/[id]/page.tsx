import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getProject } from "@/lib/data/projects";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listOrganizationUsers } from "@/lib/data/users";
import { ProjectDetailPanel } from "@/components/projects/project-detail-panel";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({ params }: PageProps) {
  await requireStaffPermission("can_view_dashboard");
  const { id } = await params;
  const [{ project, groupedTasks, staff, stakeholders }, users] = await Promise.all([
    getProject(id),
    listOrganizationUsers()
  ]);
  if (!project) notFound();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={project.name} subtitle={project.description ?? "No description"} />
        <ProjectDetailPanel
          project={project as Record<string, unknown>}
          groupedTasks={groupedTasks as Record<string, Array<Record<string, unknown>>>}
          staff={staff as Array<Record<string, unknown>>}
          stakeholders={stakeholders as Array<Record<string, unknown>>}
          users={users}
        />
      </Card>
    </div>
  );
}
