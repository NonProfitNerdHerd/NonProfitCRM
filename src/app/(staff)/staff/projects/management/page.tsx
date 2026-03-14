import { Card, CardHeader } from "@/components/ui/card";
import { canCreateProjects, listProjects } from "@/lib/data/projects";
import { requireStaffPermission } from "@/lib/auth/guards";
import {
  ProjectsDashboard,
  type ProjectRow,
  type UserOption
} from "@/components/projects/projects-dashboard";
import { listOrganizationUsers } from "@/lib/data/users";

export default async function ProjectManagementIndexPage() {
  await requireStaffPermission("can_view_dashboard");
  const [projects, canCreate, users] = await Promise.all([
    listProjects({ status: "all" }),
    canCreateProjects(),
    listOrganizationUsers()
  ]);

  return (
    <Card>
      <CardHeader
        title="Project Management"
        subtitle="Select and manage projects with staffing and stakeholder workflows"
      />
      <ProjectsDashboard
        projects={projects as ProjectRow[]}
        canCreate={canCreate}
        users={users as UserOption[]}
        detailBasePath="/staff/projects/management"
      />
    </Card>
  );
}
