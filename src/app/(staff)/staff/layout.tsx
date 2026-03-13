import { ReactNode } from "react";
import { StaffSidebar } from "@/components/layout/staff-sidebar";
import { StaffHeader } from "@/components/layout/staff-header";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const context = await requireStaffPermission("can_view_dashboard");

  return (
    <div className="flex min-h-screen">
      <StaffSidebar />
      <div className="flex-1 p-6">
        <StaffHeader organizationId={context.organizationId} />
        {children}
      </div>
    </div>
  );
}
