import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { StaffSidebar } from "@/components/layout/staff-sidebar";
import { StaffHeader } from "@/components/layout/staff-header";
import { hasAnyStaffPermission, hasRoleKeys, requireStaffPermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { listTasks } from "@/lib/data/tasks";
import { ensureConstituentOutreachProject } from "@/lib/data/projects";
import { MyTasksSideRail, type MyTasksSideRailItem } from "@/components/tasks/my-tasks-side-rail";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const context = await requireStaffPermission("can_view_dashboard");
  const canAccessDataTools = await hasRoleKeys(["administrator", "data_steward"], context);
  const canAccessVolunteerCoordination = await hasAnyStaffPermission(
    ["can_view_volunteer_coordination", "can_manage_volunteer_coordination"],
    context
  );
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.must_change_password) {
      redirect("/change-password");
    }
  }
  const { data: organization } = await supabase
    .from("organizations")
    .select("name,slug,logo_url")
    .eq("id", context.organizationId)
    .maybeSingle();
  const myTasks = await listTasks({ assignedTo: context.userId });
  let constituentOutreachProjectId: string | null = null;
  try {
    constituentOutreachProjectId = await ensureConstituentOutreachProject({
      organizationId: context.organizationId,
      userId: context.userId
    });
  } catch {
    constituentOutreachProjectId = null;
  }
  const myAssignedTasks = (myTasks as Array<Record<string, unknown>>)
    .map((task) => ({
      id: String(task.id ?? ""),
      title: (task.title as string | null | undefined) ?? null,
      due_date: (task.due_date as string | null | undefined) ?? null,
      status: (task.status as string | null | undefined) ?? null,
      priority: (task.priority as string | null | undefined) ?? null,
      completed_at: (task.completed_at as string | null | undefined) ?? null,
      parent_task_id: (task.parent_task_id as string | null | undefined) ?? null,
      project_id: (task.project_id as string | null | undefined) ?? null,
      project_name: ((task.projects as { name?: string } | null | undefined)?.name ?? null) as string | null
    }))
    .filter((task) => task.id.length > 0) as MyTasksSideRailItem[];

  return (
    <div className="flex min-h-screen print:block">
      <div className="print:hidden">
        <StaffSidebar
          canAccessDataTools={canAccessDataTools}
          canAccessVolunteerCoordination={canAccessVolunteerCoordination}
          organizationName={String(organization?.name ?? "")}
          organizationSlug={String(organization?.slug ?? "")}
          organizationLogoUrl={String((organization as { logo_url?: string } | null)?.logo_url ?? "")}
        />
      </div>
      <div className="flex-1 pb-6 pl-6 pr-24 pt-0 print:p-0 md:pr-28">
        <div className="print:hidden">
          <StaffHeader
            organizationName={String(organization?.name ?? "")}
            organizationSlug={String(organization?.slug ?? "")}
          />
        </div>
        {children}
      </div>
      <MyTasksSideRail tasks={myAssignedTasks} defaultProjectId={constituentOutreachProjectId} />
    </div>
  );
}
