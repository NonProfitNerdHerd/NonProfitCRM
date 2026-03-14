import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission } from "@/lib/auth/guards";

type RoleTemplateRow = {
  id: string;
  key: string;
  name: string;
};

export type AdminRoleTemplate = RoleTemplateRow;

export type AdminManagedUser = {
  membership_id: string;
  user_id: string;
  is_active: boolean;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  username: string;
  roles: Array<{ id: string; key: string; name: string }>;
};

function randomPassword() {
  return `Tmp!${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

async function getAllowedRoles(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_templates")
    .select("id, key, name")
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RoleTemplateRow[];
}

function validateRoleIds(roles: string[], roleRows: RoleTemplateRow[]) {
  const set = new Set(roleRows.map((row) => row.id));
  return roles.filter((roleId) => set.has(roleId));
}

export async function listAdminUsersData() {
  const context = await requireStaffPermission("can_manage_users");
  const supabase = await createClient();

  const [roles, membershipsResult, extraRolesResult] = await Promise.all([
    getAllowedRoles(context.organizationId),
    supabase
      .from("organization_memberships")
      .select("id, user_id, is_active, role_template_id, role_templates(id,key,name)")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("organization_user_role_assignments")
      .select("user_id, role_template_id, role_templates(id,key,name)")
      .eq("organization_id", context.organizationId)
  ]);

  if (membershipsResult.error) throw membershipsResult.error;
  if (extraRolesResult.error) throw extraRolesResult.error;

  const memberships = membershipsResult.data ?? [];
  const userIds = memberships.map((membership) => membership.user_id as string);
  const profilesResult = userIds.length
    ? await supabase.rpc("admin_org_user_profiles", { org_id: context.organizationId })
    : { data: [] as Array<Record<string, unknown>>, error: null };
  if (profilesResult.error) throw profilesResult.error;

  const profileMap = new Map<string, Record<string, unknown>>();
  for (const profile of profilesResult.data ?? []) {
    profileMap.set(profile.id as string, profile);
  }

  const extraMap = new Map<string, Array<Record<string, unknown>>>();
  for (const role of extraRolesResult.data ?? []) {
    const list = extraMap.get(role.user_id as string) ?? [];
    list.push(role as Record<string, unknown>);
    extraMap.set(role.user_id as string, list);
  }

  const users: AdminManagedUser[] = memberships.map((membership) => {
    const primaryRole = Array.isArray(membership.role_templates)
      ? membership.role_templates[0]
      : membership.role_templates;
    const extraRoles = extraMap.get(membership.user_id as string) ?? [];
    const profile = profileMap.get(membership.user_id as string);
    const mergedRoles = [
      primaryRole
        ? {
            id: String((primaryRole as Record<string, unknown>).id ?? ""),
            key: String((primaryRole as Record<string, unknown>).key ?? ""),
            name: String((primaryRole as Record<string, unknown>).name ?? "")
          }
        : null,
      ...extraRoles.map((extraRole) =>
        Array.isArray(extraRole.role_templates)
          ? {
              id: String(
                ((extraRole.role_templates[0] as Record<string, unknown>).id as string) ?? ""
              ),
              key: String(
                ((extraRole.role_templates[0] as Record<string, unknown>).key as string) ?? ""
              ),
              name: String(
                ((extraRole.role_templates[0] as Record<string, unknown>).name as string) ?? ""
              )
            }
          : {
              id: String(((extraRole.role_templates as Record<string, unknown>).id as string) ?? ""),
              key: String(((extraRole.role_templates as Record<string, unknown>).key as string) ?? ""),
              name: String(((extraRole.role_templates as Record<string, unknown>).name as string) ?? "")
            }
      )
    ]
      .filter(Boolean)
      .filter((role): role is { id: string; key: string; name: string } => Boolean(role?.id));

    return {
      membership_id: membership.id as string,
      user_id: membership.user_id as string,
      is_active: Boolean(membership.is_active),
      first_name: (profile?.first_name as string) ?? "",
      last_name: (profile?.last_name as string) ?? "",
      display_name: (profile?.display_name as string) ?? "",
      email: (profile?.email as string) ?? "",
      username: (profile?.username as string) ?? "",
      roles: mergedRoles
    };
  });

  return { users, roles };
}

export async function createAdminUser(input: {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  username?: string;
  isActive: boolean;
  roleTemplateIds: string[];
  password?: string;
}) {
  const context = await requireStaffPermission("can_manage_users");
  const adminClient = createAdminClient();
  const roles = await getAllowedRoles(context.organizationId);
  const validRoleIds = validateRoleIds(input.roleTemplateIds, roles);
  if (validRoleIds.length === 0) {
    throw new Error("At least one valid role is required.");
  }

  const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
    email: input.email,
    password: input.password || randomPassword(),
    email_confirm: true,
    user_metadata: {
      display_name: input.displayName || `${input.firstName} ${input.lastName}`.trim()
    }
  });
  if (createError) throw createError;

  const userId = createdUser.user.id;
  const [primaryRoleId, ...additionalRoleIds] = validRoleIds;

  const { error: profileError } = await adminClient.from("profiles").upsert({
    id: userId,
    first_name: input.firstName,
    last_name: input.lastName,
    display_name: input.displayName || `${input.firstName} ${input.lastName}`.trim(),
    email: input.email,
    username: input.username ?? null,
    is_active: input.isActive
  });
  if (profileError) throw profileError;

  const { error: membershipError } = await adminClient.from("organization_memberships").upsert(
    {
      organization_id: context.organizationId,
      user_id: userId,
      role_template_id: primaryRoleId,
      is_active: input.isActive
    },
    { onConflict: "organization_id,user_id" }
  );
  if (membershipError) throw membershipError;

  if (additionalRoleIds.length > 0) {
    const { error: additionalRolesError } = await adminClient
      .from("organization_user_role_assignments")
      .upsert(
        additionalRoleIds.map((roleTemplateId) => ({
          organization_id: context.organizationId,
          user_id: userId,
          role_template_id: roleTemplateId,
          created_by: context.userId
        })),
        { onConflict: "organization_id,user_id,role_template_id" }
      );
    if (additionalRolesError) throw additionalRolesError;
  }

  return userId;
}

export async function updateAdminUser(input: {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  username?: string;
  isActive: boolean;
  roleTemplateIds: string[];
}) {
  const context = await requireStaffPermission("can_manage_users");
  const adminClient = createAdminClient();
  const roles = await getAllowedRoles(context.organizationId);
  const validRoleIds = validateRoleIds(input.roleTemplateIds, roles);
  if (validRoleIds.length === 0) {
    throw new Error("At least one valid role is required.");
  }

  const [primaryRoleId, ...additionalRoleIds] = validRoleIds;

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      display_name: input.displayName || `${input.firstName} ${input.lastName}`.trim(),
      email: input.email,
      username: input.username ?? null,
      is_active: input.isActive
    })
    .eq("id", input.userId);
  if (profileError) throw profileError;

  const { error: membershipError } = await adminClient.from("organization_memberships").upsert(
    {
      organization_id: context.organizationId,
      user_id: input.userId,
      role_template_id: primaryRoleId,
      is_active: input.isActive
    },
    { onConflict: "organization_id,user_id" }
  );
  if (membershipError) throw membershipError;

  const { error: deleteError } = await adminClient
    .from("organization_user_role_assignments")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("user_id", input.userId);
  if (deleteError) throw deleteError;

  if (additionalRoleIds.length > 0) {
    const { error: insertError } = await adminClient
      .from("organization_user_role_assignments")
      .insert(
        additionalRoleIds.map((roleTemplateId) => ({
          organization_id: context.organizationId,
          user_id: input.userId,
          role_template_id: roleTemplateId,
          created_by: context.userId
        }))
      );
    if (insertError) throw insertError;
  }
}
