import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function UserManagementPage() {
  const context = await requireStaffPermission("can_manage_users");
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organization_memberships")
    .select("id, user_id, is_active, role_templates(name,key)")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  return (
    <Card>
      <CardHeader
        title="User Management"
        subtitle="Organization members and assigned role templates"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">User ID</th>
              <th className="py-2">Role Template</th>
              <th className="py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((member) => {
              const roleTemplate = Array.isArray(member.role_templates)
                ? member.role_templates[0]
                : member.role_templates;

              return (
                <tr className="border-b border-slate-100" key={member.id}>
                  <td className="py-2">{member.user_id}</td>
                  <td className="py-2">
                    {roleTemplate?.name} ({roleTemplate?.key})
                  </td>
                  <td className="py-2">{member.is_active ? "Yes" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
