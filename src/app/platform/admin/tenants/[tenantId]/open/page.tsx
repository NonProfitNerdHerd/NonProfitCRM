import { redirect } from "next/navigation";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export default async function OpenTenantConsolePage({ params }: PageProps) {
  const context = await requirePlatformAdminAccess();
  const { tenantId } = await params;
  const resolvedTenantId = toText(tenantId);
  if (!resolvedTenantId) {
    redirect("/platform/admin/tenants");
  }

  const supabase = await createClient();
  const [{ data: tenant, error: tenantError }, { data: adminRole, error: adminRoleError }] =
    await Promise.all([
      supabase.from("tenants").select("id").eq("id", resolvedTenantId).maybeSingle(),
      supabase
        .from("role_templates")
        .select("id")
        .is("organization_id", null)
        .eq("key", "administrator")
        .maybeSingle()
    ]);

  if (tenantError || !tenant || adminRoleError || !adminRole?.id) {
    redirect("/platform/admin/tenants");
  }

  await supabase.from("organization_memberships").upsert(
    {
      organization_id: resolvedTenantId,
      user_id: context.userId,
      role_template_id: toText(adminRole.id),
      is_active: true
    },
    { onConflict: "organization_id,user_id" }
  );

  await supabase
    .from("profiles")
    .update({ default_organization_id: resolvedTenantId })
    .eq("id", context.userId);

  redirect("/staff/dashboard");
}
