import { Card, CardHeader } from "@/components/ui/card";
import { listProjects } from "@/lib/data/projects";
import { listTasks } from "@/lib/data/tasks";
import { requireStaffPermission } from "@/lib/auth/guards";
import {
  ProjectsPortfolioGantt,
  type PortfolioTaskRow,
  type ProjectPortfolioRow
} from "@/components/projects/projects-portfolio-gantt";
import Link from "next/link";

export default async function ProjectsPage() {
  await requireStaffPermission("can_view_dashboard");
  const [projects, tasks] = await Promise.all([listProjects({ status: "all" }), listTasks()]);

  return (
    <Card>
      <CardHeader
        title="Projects Portfolio"
        subtitle="Portfolio viewer with project Gantt, calendar scheduling, and 30-60-90 task readiness."
      />
      <div className="mb-3 flex justify-end">
        <Link
          href="/staff/projects/management"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Open Project Management
        </Link>
      </div>
      <ProjectsPortfolioGantt
        projects={projects as ProjectPortfolioRow[]}
        tasks={tasks as PortfolioTaskRow[]}
      />
    </Card>
  );
}
