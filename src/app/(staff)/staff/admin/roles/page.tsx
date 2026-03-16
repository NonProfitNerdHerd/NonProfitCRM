import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireAdministratorRole } from "@/lib/auth/guards";
import { ROLE_HIERARCHY_DESCRIPTIONS, roleOrderScore } from "@/lib/auth/role-hierarchy";

export default async function RoleTemplatesPage() {
  const context = await requireAdministratorRole();
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

  return (
    <div className="space-y-4">
      {rows.map((template, index) => (
        <Card key={template.id}>
          <CardHeader
            title={template.name}
            subtitle={
              ROLE_HIERARCHY_DESCRIPTIONS[template.key as keyof typeof ROLE_HIERARCHY_DESCRIPTIONS] ??
              template.description ??
              "No description"
            }
          />
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{template.is_system_template ? "System template" : "Custom template"}</span>
            <span>•</span>
            <span>Hierarchy Rank: {index + 1}</span>
          </div>
          <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 p-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Permission Summary
            </p>
            <div className="grid gap-1 text-xs text-slate-700 md:grid-cols-2">
              {Object.entries(
                (template.role_template_permissions ?? []).reduce<Record<string, number>>(
                  (acc, assignment) => {
                    const permission = Array.isArray(assignment.permissions)
                      ? assignment.permissions[0]
                      : assignment.permissions;
                    const key = String(permission?.key ?? "");
                    const moduleKey = key.startsWith("can_")
                      ? key.replace("can_", "").split("_")[0]
                      : "other";
                    acc[moduleKey] = (acc[moduleKey] ?? 0) + 1;
                    return acc;
                  },
                  {}
                )
              ).map(([module, count]) => (
                <p key={`${template.id}-${module}`}>
                  {module.toUpperCase()}: {count} permission{count === 1 ? "" : "s"}
                </p>
              ))}
            </div>
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
