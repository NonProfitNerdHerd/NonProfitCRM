import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { canCreateProjects, listProjects } from "@/lib/data/projects";
import { requireStaffPermission } from "@/lib/auth/guards";
import { ProjectForm } from "@/components/forms/project-form";
import { formatDate } from "@/lib/utils";

export default async function ProjectsPage() {
  await requireStaffPermission("can_view_dashboard");
  const [projects, canCreate] = await Promise.all([listProjects(), canCreateProjects()]);

  return (
    <Card>
      <CardHeader
        title="Projects"
        subtitle="Project-based task grouping and execution tracking"
      />
      {canCreate ? (
        <div className="mb-4">
          <ProjectForm />
        </div>
      ) : (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only Administrators and Executive Leaders can create projects.
        </p>
      )}

      <div className="space-y-2">
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">No projects available.</p>
        ) : (
          projects.map((project) => (
            <Link
              className="block rounded-md border border-slate-200 px-4 py-3 hover:bg-slate-50"
              href={`/staff/projects/${project.id}`}
              key={project.id}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{project.name}</p>
                <span className="text-xs text-slate-500">{formatDate(project.created_at)}</span>
              </div>
              <p className="text-xs text-slate-600">{project.description ?? "-"}</p>
              <p className="mt-1 text-xs text-slate-500">Status: {project.status}</p>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
