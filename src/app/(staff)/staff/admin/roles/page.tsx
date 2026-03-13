import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function RoleTemplatesPage() {
  const context = await requireStaffPermission("can_manage_role_templates");
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("role_templates")
    .select(
      "id,key,name,description,is_system_template,role_template_permissions(permission_id,permissions(key,name))"
    )
    .or(`organization_id.is.null,organization_id.eq.${context.organizationId}`)
    .order("name", { ascending: true });

  return (
    <div className="space-y-4">
      {(templates ?? []).map((template) => (
        <Card key={template.id}>
          <CardHeader
            title={template.name}
            subtitle={template.description ?? "No description"}
          />
          <div className="mb-2 text-xs text-slate-500">
            {template.is_system_template ? "System template" : "Custom template"}
          </div>
          <div className="flex flex-wrap gap-2">
            {(template.role_template_permissions ?? []).map((assignment) => {
              const permission = Array.isArray(assignment.permissions)
                ? assignment.permissions[0]
                : assignment.permissions;
              return (
                <span
                  className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                  key={assignment.permission_id}
                >
                  {permission?.key}
                </span>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
