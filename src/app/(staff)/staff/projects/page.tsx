import { Card, CardHeader } from "@/components/ui/card";
import { listProjects } from "@/lib/data/projects";
import { requireStaffPermission } from "@/lib/auth/guards";
import {
  ProjectsPortfolioGantt,
  type ProjectPortfolioRow
} from "@/components/projects/projects-portfolio-gantt";
import Link from "next/link";

export default async function ProjectsPage() {
  await requireStaffPermission("can_view_dashboard");
  const projects = await listProjects({ status: "all" });

  return (
    <Card>
      <CardHeader
        title="Projects Portfolio"
        subtitle="Active project timelines in a Gantt-style portfolio view"
      />
      <div className="mb-3 flex justify-end">
        <Link
          href="/staff/projects/management"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Open Project Management
        </Link>
      </div>
      <ProjectsPortfolioGantt projects={projects as ProjectPortfolioRow[]} />
    </Card>
  );
}
