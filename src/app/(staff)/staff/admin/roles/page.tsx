import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { ROLE_HIERARCHY_DESCRIPTIONS, roleOrderScore } from "@/lib/auth/role-hierarchy";
import { RolesDashboard } from "@/components/admin/roles/roles-dashboard";

export default async function RoleTemplatesPage() {
  const context = await requireStaffPermission("can_view_roles");
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("role_templates")
    .select(
      "id,key,name,description,is_system_template,role_template_permissions(permission_id,permissions(key,name))"
    )
    .or(`organization_id.is.null,organization_id.eq.${context.organizationId}`)
    .order("name", { ascending: true });

  const rows = (templates ?? [])
    .filter((template) => template.key !== "executive_leader")
    .sort((a, b) => {
    const keyA = String(a.key ?? "");
    const keyB = String(b.key ?? "");
    const score = roleOrderScore(keyA) - roleOrderScore(keyB);
    if (score !== 0) return score;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });

  const roles = rows.map((template, index) => {
    const permissions = (template.role_template_permissions ?? [])
      .map((assignment) => {
        const permission = Array.isArray(assignment.permissions)
          ? assignment.permissions[0]
          : assignment.permissions;
        return {
          id: String(assignment.permission_id ?? ""),
          key: String(permission?.key ?? ""),
          name: String(permission?.name ?? "")
        };
      })
      .filter((permission) => permission.id && permission.key)
      .sort((a, b) => a.key.localeCompare(b.key));
    return {
      id: String(template.id ?? ""),
      key: String(template.key ?? ""),
      name: String(template.name ?? ""),
      description:
        ROLE_HIERARCHY_DESCRIPTIONS[template.key as keyof typeof ROLE_HIERARCHY_DESCRIPTIONS] ??
        String(template.description ?? "No description"),
      isSystemTemplate: Boolean(template.is_system_template),
      hierarchyRank: index + 1,
      permissions
    };
  });

  return (
    <Card>
      <CardHeader
        title="Roles"
        subtitle="Role hierarchy and capability matrix (view-only unless Administrator)"
      />
      <RolesDashboard roles={roles} />
    </Card>
  );
}
