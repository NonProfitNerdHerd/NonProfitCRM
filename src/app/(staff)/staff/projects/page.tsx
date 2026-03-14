import { Card, CardHeader } from "@/components/ui/card";
import { canCreateProjects, listProjects } from "@/lib/data/projects";
import { requireStaffPermission } from "@/lib/auth/guards";
import {
  ProjectsDashboard,
  type ProjectRow,
  type UserOption
} from "@/components/projects/projects-dashboard";
import { listOrganizationUsers } from "@/lib/data/users";

export default async function ProjectsPage() {
  await requireStaffPermission("can_view_dashboard");
  const [projects, canCreate, users] = await Promise.all([
    listProjects({ status: "all" }),
    canCreateProjects(),
    listOrganizationUsers()
  ]);

  return (
    <Card>
      <CardHeader
        title="Projects"
        subtitle="Project-based task grouping and execution tracking"
      />
      <ProjectsDashboard
        projects={projects as ProjectRow[]}
        canCreate={canCreate}
        users={users as UserOption[]}
      />
    </Card>
  );
}
