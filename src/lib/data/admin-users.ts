import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createAdminClientOrNull } from "@/lib/supabase/admin";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  requireAdministratorRole,
  requireAnyStaffPermission
} from "@/lib/auth/guards";
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
  throwIfDataError(error, "Failed to load available roles.");
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

function displayNameFromInput(input: { displayName: string; firstName: string; lastName: string }) {
  return input.displayName || `${input.firstName} ${input.lastName}`.trim();
}

function toFriendlyProvisionError(error: unknown) {
  const value = error as { message?: string; details?: string; hint?: string; code?: string };
  const message = [value?.message, value?.details, value?.hint, value?.code]
    .filter(Boolean)
    .join(" ");
  const lower = message.toLowerCase();
  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "A user with this email already exists in authentication.";
  }
  if (lower.includes("email") && lower.includes("disabled")) {
    return "Email/password signup is currently disabled for this environment.";
  }
  return message || "Failed to provision user account.";
}

function formatDataError(error: unknown, fallback: string) {
  const value = error as { message?: string; details?: string; hint?: string; code?: string };
  const message = [value?.message, value?.details, value?.hint, value?.code]
    .filter(Boolean)
    .join(" ");
  return message || fallback;
}

function throwIfDataError(error: unknown, fallback: string) {
  if (!error) return;
  throw new Error(formatDataError(error, fallback));
}

export async function listAdminUsersData() {
  const context = await requireAnyStaffPermission([
    "can_view_users",
    "can_manage_users"
  ]);
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

  throwIfDataError(membershipsResult.error, "Failed to load organization memberships.");
  throwIfDataError(extraRolesResult.error, "Failed to load additional role assignments.");

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
        throwIfDataError(adminProfilesResult.error, "Failed to load profile records.");
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
  const adminClient = createAdminClientOrNull();
  const supabase = await createClient();
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
  const displayName = displayNameFromInput(input);
  let userId = "";
  if (adminClient) {
    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        display_name: displayName
      }
    });
    throwIfDataError(createError, "Failed to create auth user.");
    userId = String(createdUser?.user?.id ?? "");
    if (!userId) {
      throw new Error("Auth user was not returned after creation.");
    }
  } else {
    const publicAuthClient = createPublicServerClient();
    const { data: createdUser, error: signUpError } = await publicAuthClient.auth.signUp({
      email,
      password: temporaryPassword,
      options: {
        data: { display_name: displayName }
      }
    });
    if (signUpError) {
      throw new Error(toFriendlyProvisionError(signUpError));
    }
    userId = String(createdUser?.user?.id ?? "");
    if (!userId) {
      throw new Error(
        "Unable to provision user account without service-role key. Please enable email/password signup or configure SUPABASE_SERVICE_ROLE_KEY."
      );
    }
  }

  const [primaryRoleId, ...additionalRoleIds] = validRoleIds;

  const { error: profileError } = await supabase.rpc("admin_upsert_user_profile", {
    org_id: context.organizationId,
    target_user_id: userId,
    first_name: input.firstName,
    last_name: input.lastName,
    display_name: displayName,
    email,
    username: input.username ?? null,
    is_active: input.isActive,
    must_change_password: true
  });
  throwIfDataError(profileError, "Failed to save user profile.");

  const { error: membershipError } = await supabase.from("organization_memberships").upsert(
    {
      organization_id: context.organizationId,
      user_id: userId,
      role_template_id: primaryRoleId,
      is_active: input.isActive
    },
    { onConflict: "organization_id,user_id" }
  );
  throwIfDataError(membershipError, "Failed to create organization membership.");

  if (additionalRoleIds.length > 0) {
    const { error: additionalRolesError } = await supabase
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
    throwIfDataError(additionalRolesError, "Failed to save additional role assignments.");
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
  const supabase = await createClient();
  const roles = await getAllowedRoles(context.organizationId);
  const validRoleIds = validateRoleIds(input.roleTemplateIds, roles);
  if (validRoleIds.length === 0) {
    throw new Error("At least one valid role is required.");
  }

  const [primaryRoleId, ...additionalRoleIds] = validRoleIds;

  const { error: profileError } = await supabase.rpc("admin_upsert_user_profile", {
    org_id: context.organizationId,
    target_user_id: input.userId,
    first_name: input.firstName,
    last_name: input.lastName,
    display_name: displayNameFromInput(input),
    email: input.email.trim(),
    username: input.username ?? null,
    is_active: input.isActive,
    must_change_password: null
  });
  throwIfDataError(profileError, "Failed to update user profile.");

  const { error: membershipError } = await supabase.from("organization_memberships").upsert(
    {
      organization_id: context.organizationId,
      user_id: input.userId,
      role_template_id: primaryRoleId,
      is_active: input.isActive
    },
    { onConflict: "organization_id,user_id" }
  );
  throwIfDataError(membershipError, "Failed to update organization membership.");

  const { error: deleteError } = await supabase
    .from("organization_user_role_assignments")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("user_id", input.userId);
  throwIfDataError(deleteError, "Failed to update role assignments.");

  if (additionalRoleIds.length > 0) {
    const { error: insertError } = await supabase
      .from("organization_user_role_assignments")
      .insert(
        additionalRoleIds.map((roleTemplateId) => ({
          organization_id: context.organizationId,
          user_id: input.userId,
          role_template_id: roleTemplateId,
          created_by: context.userId
        }))
      );
    throwIfDataError(insertError, "Failed to save role assignments.");
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
  throwIfDataError(membershipError, "User membership lookup failed.");
  if (!membership) {
    throw new Error("User is not a member of this organization.");
  }

  const { error: resetError } = await adminClient.auth.admin.updateUserById(userId, {
    password: temporaryPassword
  });
  throwIfDataError(resetError, "Failed to reset user password.");

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ must_change_password: true, is_active: true })
    .eq("id", userId);
  throwIfDataError(profileError, "Failed to mark password reset flags.");

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
