import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { StaffSidebar } from "@/components/layout/staff-sidebar";
import { StaffHeader } from "@/components/layout/staff-header";
import { hasAnyStaffPermission, hasRoleKeys, requireStaffPermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <div className="flex min-h-screen print:block">
      <div className="print:hidden">
        <StaffSidebar
          canAccessDataTools={canAccessDataTools}
          canAccessVolunteerCoordination={canAccessVolunteerCoordination}
        />
      </div>
      <div className="flex-1 px-6 pb-6 pt-0 print:p-0">
        <div className="print:hidden">
          <StaffHeader organizationId={context.organizationId} />
        </div>
        {children}
      </div>
    </div>
  );
}
