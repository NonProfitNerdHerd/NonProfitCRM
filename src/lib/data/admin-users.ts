import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdministratorRole, requireStaffPermission } from "@/lib/auth/guards";
import { ROLE_HIERARCHY_DESCRIPTIONS, roleOrderScore } from "@/lib/auth/role-hierarchy";
import { logAuditEvent } from "@/lib/data/audit";

type RoleTemplateRow = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
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

function generateTemporaryPassword() {
  return `Tmp!${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

async function getAllowedRoles(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_templates")
    .select("id, key, name, description")
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order("name", { ascending: true });
  if (error) throw error;
  const canonical = new Map<string, RoleTemplateRow>();
  const additional: RoleTemplateRow[] = [];
  for (const row of (data ?? []) as RoleTemplateRow[]) {
    if (row.key === "executive_leader") continue;
    if (ROLE_HIERARCHY_DESCRIPTIONS[row.key as keyof typeof ROLE_HIERARCHY_DESCRIPTIONS]) {
      canonical.set(row.key, row);
    } else {
      additional.push(row);
    }
  }
  const orderedCanonical = Array.from(canonical.values()).sort(
    (a, b) => roleOrderScore(a.key) - roleOrderScore(b.key)
  );
  additional.sort((a, b) => a.name.localeCompare(b.name));
  return [...orderedCanonical, ...additional];
}

function validateRoleIds(roles: string[], roleRows: RoleTemplateRow[]) {
  const set = new Set(roleRows.map((row) => row.id));
  return roles.filter((roleId) => set.has(roleId));
}

export async function listAdminUsersData() {
  const context = await requireStaffPermission("can_view_users");
  const supabase = await createClient();
  const { data: canManageUsersRaw } = await supabase.rpc("has_permission", {
    org_id: context.organizationId,
    permission_key: "can_manage_users"
  });
  const canManageUsers = Boolean(canManageUsersRaw);

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
  let profilesData: Array<Record<string, unknown>> = [];
  if (userIds.length > 0) {
    const profilesResult = await supabase.rpc("admin_org_user_profiles", {
      org_id: context.organizationId
    });
    if (profilesResult.error) {
      try {
        const adminClient = createAdminClient();
        const adminProfilesResult = await adminClient
          .from("profiles")
          .select("id, first_name, last_name, display_name, email, username, is_active")
          .in("id", userIds);
        if (adminProfilesResult.error) throw adminProfilesResult.error;
        profilesData = (adminProfilesResult.data ?? []) as Array<Record<string, unknown>>;
      } catch {
        // Keep the page usable even if neither RPC nor admin key are available.
        profilesData = userIds.map((id) => ({
          id,
          first_name: "",
          last_name: "",
          display_name: "",
          email: "",
          username: "",
          is_active: true
        }));
      }
    } else {
      profilesData = (profilesResult.data ?? []) as Array<Record<string, unknown>>;
    }
  }

  const profileMap = new Map<string, Record<string, unknown>>();
  for (const profile of profilesData) {
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
      .filter((role): role is { id: string; key: string; name: string } => Boolean(role?.id))
      .filter(
        (role, idx, all) => all.findIndex((candidate) => candidate.id === role.id) === idx
      );

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

  return { users, roles, canManageUsers };
}

export async function createAdminUser(input: {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  username?: string;
  isActive: boolean;
  roleTemplateIds: string[];
}) {
  const context = await requireAdministratorRole();
  const adminClient = createAdminClient();
  const roles = await getAllowedRoles(context.organizationId);
  const email = input.email.trim();
  if (!email) {
    throw new Error("Email is required.");
  }
  const validRoleIds = validateRoleIds(input.roleTemplateIds, roles);
  if (validRoleIds.length === 0) {
    throw new Error("At least one valid role is required.");
  }
  const temporaryPassword = generateTemporaryPassword();

  const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
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
    email,
    username: input.username ?? null,
    is_active: input.isActive,
    must_change_password: true
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

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "role_assignment_created",
    targetEntityType: "organization_memberships",
    targetEntityId: userId,
    metadata: {
      assignedRoleTemplateIds: validRoleIds,
      assignedRoleKeys: roles.filter((role) => validRoleIds.includes(role.id)).map((role) => role.key)
    }
  });

  return { userId, temporaryPassword };
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
  const context = await requireAdministratorRole();
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

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "role_assignment_updated",
    targetEntityType: "organization_memberships",
    targetEntityId: input.userId,
    metadata: {
      assignedRoleTemplateIds: validRoleIds,
      assignedRoleKeys: roles.filter((role) => validRoleIds.includes(role.id)).map((role) => role.key)
    }
  });
}

export async function resetAdminUserPassword(userId: string) {
  const context = await requireAdministratorRole();
  const adminClient = createAdminClient();
  const temporaryPassword = generateTemporaryPassword();

  const { data: membership, error: membershipError } = await adminClient
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", context.organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) {
    throw new Error("User is not a member of this organization.");
  }

  const { error: resetError } = await adminClient.auth.admin.updateUserById(userId, {
    password: temporaryPassword
  });
  if (resetError) throw resetError;

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ must_change_password: true, is_active: true })
    .eq("id", userId);
  if (profileError) throw profileError;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "admin_user_password_reset",
    targetEntityType: "profiles",
    targetEntityId: userId,
    metadata: {}
  });

  return { temporaryPassword };
}
