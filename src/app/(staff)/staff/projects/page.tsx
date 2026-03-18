import { Card, CardHeader } from "@/components/ui/card";
import { listProjects } from "@/lib/data/projects";
import { listTasks } from "@/lib/data/tasks";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listOrganizationUsers } from "@/lib/data/users";
import {
  ProjectsPortfolioGantt,
  type PortfolioTaskRow,
  type ProjectPortfolioRow
} from "@/components/projects/projects-portfolio-gantt";
import { MyTasksSideRail, type MyTasksSideRailItem } from "@/components/tasks/my-tasks-side-rail";
import Link from "next/link";

export default async function ProjectsPage() {
  const context = await requireStaffPermission("can_view_dashboard");
  const [projects, tasks, users] = await Promise.all([
    listProjects({ status: "all" }),
    listTasks(),
    listOrganizationUsers()
  ]);
  const assigneeById = Object.fromEntries(
    users.map((user) => [user.user_id, user.display_name || user.user_id])
  );
  const myAssignedTasks = (tasks as Array<Record<string, unknown>>)
    .filter((task) => String(task.assigned_to ?? "") === context.userId)
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
            assigneeById={assigneeById}
          />
        </Card>
      </div>
      <MyTasksSideRail tasks={myAssignedTasks} />
    </>
  );
}
