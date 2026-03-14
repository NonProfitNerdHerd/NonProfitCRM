import { createClient } from "@/lib/supabase/server";
import { requireSessionContext, requireStaffPermission } from "@/lib/auth/guards";

export type OrgUser = {
  user_id: string;
  display_name: string | null;
  role_key: string | null;
  role_name: string | null;
};

export async function listOrganizationUsers(): Promise<OrgUser[]> {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("user_id, role_templates(key, name)")
    .eq("organization_id", context.organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (membershipError) throw membershipError;

  const userIds = (memberships ?? []).map((membership) => membership.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  if (profileError) throw profileError;

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile.display_name ?? null])
  );

  return (memberships ?? []).map((membership) => {
    const role = Array.isArray(membership.role_templates)
      ? membership.role_templates[0]
      : membership.role_templates;

    return {
      user_id: membership.user_id as string,
      display_name: profileMap.get(membership.user_id as string) ?? null,
      role_key: (role?.key as string | undefined) ?? null,
      role_name: (role?.name as string | undefined) ?? null
    };
  });
}

export async function currentUserRoleKey() {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("user_role_key", {
    org_id: context.organizationId
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function resolveMentions(displayNames: string[]) {
  const normalized = new Set(displayNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (normalized.size === 0) return [];

  const users = await listOrganizationUsers();
  return users
    .filter((user) => user.display_name && normalized.has(user.display_name.toLowerCase()))
    .map((user) => user.user_id);
}
