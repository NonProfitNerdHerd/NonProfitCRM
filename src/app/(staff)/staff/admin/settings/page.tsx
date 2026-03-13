import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function OrganizationSettingsPage() {
  const context = await requireStaffPermission("can_manage_org_settings");
  const supabase = await createClient();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id,name,slug,created_at")
    .eq("id", context.organizationId)
    .maybeSingle();

  return (
    <Card>
      <CardHeader
        title="Organization Settings"
        subtitle="Tenant-level settings and governance controls"
      />
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="text-slate-500">Organization ID</p>
          <p>{organization?.id}</p>
        </div>
        <div>
          <p className="text-slate-500">Name</p>
          <p>{organization?.name}</p>
        </div>
        <div>
          <p className="text-slate-500">Slug</p>
          <p>{organization?.slug}</p>
        </div>
        <div>
          <p className="text-slate-500">Created At</p>
          <p>{organization?.created_at}</p>
        </div>
      </div>
    </Card>
  );
}
