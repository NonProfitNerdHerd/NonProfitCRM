import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PermissionKey } from "@/types/database";
import {
  type PlatformAccessContext,
  type PlatformRoleKey,
  PlatformAccessError,
  requirePlatformAccess
} from "@/lib/platform/auth";

export type SessionContext = {
  userId: string;
  organizationId: string;
};

export type RoleKey =
  | "administrator"
  | "data_steward"
  | "data_administrator"
  | "executive_staff"
  | "staff_pii"
  | "staff_non_pii"
  | "data_entry"
  | "volunteer"
  | string;

async function getActiveOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const requestHeaders = await headers();
  const hintedTenantId = requestHeaders.get("x-tenant-id");
  if (hintedTenantId) {
    return hintedTenantId;
  }
  const cookieStore = await cookies();
  const cookieTenantId = cookieStore.get("active_tenant_id")?.value?.trim();
  if (cookieTenantId) {
    return cookieTenantId;
  }
  const cookieTenantSlug = cookieStore.get("active_tenant_slug")?.value?.trim();
  if (cookieTenantSlug) {
    const { data: organizationBySlug } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", cookieTenantSlug)
      .maybeSingle();
    if (organizationBySlug?.id) {
      return organizationBySlug.id;
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.default_organization_id) return profile.default_organization_id;

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return membership?.organization_id ?? null;
}

export async function requireSessionContext(): Promise<SessionContext> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const organizationId = await getActiveOrgId(user.id);
  if (!organizationId) redirect("/no-organization");

  return {
    userId: user.id,
    organizationId
  };
}

export async function requireStaffPermission(
  permission: PermissionKey
): Promise<SessionContext> {
  const context = await requireSessionContext();
  const allowed = await hasStaffPermission(permission, context);
  if (!allowed) {
    redirect("/unauthorized");
  }
  return context;
}

async function hasAllowedRoleKey(
  context: SessionContext,
  allowedRoleKeys: string[]
): Promise<boolean> {
  const primaryRoleKey = await getPrimaryRoleKey(context);
  if (primaryRoleKey && allowedRoleKeys.includes(primaryRoleKey)) {
    return true;
  }

  const supabase = await createClient();
  const { data: additionalRoleRows, error } = await supabase
    .from("organization_user_role_assignments")
    .select("role_templates(key)")
    .eq("organization_id", context.organizationId)
    .eq("user_id", context.userId);
  if (error) return false;

  const additionalRoleKeys = (additionalRoleRows ?? [])
    .map((row) => {
      const roleTemplate = Array.isArray(row.role_templates)
        ? row.role_templates[0]
        : row.role_templates;
      return String((roleTemplate as { key?: string } | null)?.key ?? "");
    })
    .filter(Boolean);
  return additionalRoleKeys.some((key) => allowedRoleKeys.includes(key));
}

export async function hasRoleKeys(
  allowedRoleKeys: string[],
  context?: SessionContext
): Promise<boolean> {
  const resolvedContext = context ?? (await requireSessionContext());
  return hasAllowedRoleKey(resolvedContext, allowedRoleKeys);
}

export async function isAdministrator(context?: SessionContext): Promise<boolean> {
  const resolvedContext = context ?? (await requireSessionContext());
  return hasAllowedRoleKey(resolvedContext, ["administrator"]);
}

export async function hasStaffPermission(
  permission: PermissionKey,
  context?: SessionContext
): Promise<boolean> {
  const resolvedContext = context ?? (await requireSessionContext());
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("has_permission", {
    org_id: resolvedContext.organizationId,
    permission_key: permission
  });

  if (!error && Boolean(data)) {
    return true;
  }

  // Backward-compatible admin fallback for environments where new granular
  // permissions have not fully propagated yet.
  return isAdministrator(resolvedContext);
}

export async function hasAnyStaffPermission(
  permissions: PermissionKey[],
  context?: SessionContext
): Promise<boolean> {
  const resolvedContext = context ?? (await requireSessionContext());
  for (const permission of permissions) {
    if (await hasStaffPermission(permission, resolvedContext)) {
      return true;
    }
  }
  return false;
}

export async function requireAnyStaffPermission(
  permissions: PermissionKey[]
): Promise<SessionContext> {
  const context = await requireSessionContext();
  const allowed = await hasAnyStaffPermission(permissions, context);
  if (allowed) return context;

  redirect("/unauthorized");
  return context;
}

export async function getPrimaryRoleKey(context?: SessionContext): Promise<RoleKey | null> {
  const resolvedContext = context ?? (await requireSessionContext());
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("user_role_key", {
    org_id: resolvedContext.organizationId
  });
  if (error) return null;
  const key = String(data ?? "").trim();
  return key ? key : null;
}

export async function requireRoleKeys(allowedRoleKeys: string[]): Promise<SessionContext> {
  const context = await requireSessionContext();
  if (await hasAllowedRoleKey(context, allowedRoleKeys)) {
    return context;
  }
  redirect("/unauthorized");
  return context;
}

export async function requireAdministratorRole(): Promise<SessionContext> {
  return requireRoleKeys(["administrator"]);
}

export async function requireIntegrationManagerRole(): Promise<SessionContext> {
  return requireRoleKeys(["administrator", "data_steward", "data_administrator"]);
}

export async function requireImportCenterAccess(): Promise<SessionContext> {
  return requireRoleKeys(["administrator", "data_steward"]);
}

export async function requireVolunteerCoordinationAccess(): Promise<SessionContext> {
  return requireAnyStaffPermission([
    "can_view_volunteer_coordination",
    "can_manage_volunteer_coordination"
  ]);
}

export async function requireVolunteerCoordinationManager(): Promise<SessionContext> {
  return requireStaffPermission("can_manage_volunteer_coordination");
}

export async function requireVolunteerSensitiveAccess(): Promise<SessionContext> {
  return requireAnyStaffPermission([
    "can_view_volunteer_sensitive",
    "can_manage_volunteer_sensitive"
  ]);
}

export async function requireVolunteerSensitiveManager(): Promise<SessionContext> {
  return requireStaffPermission("can_manage_volunteer_sensitive");
}

export async function requirePortalIdentity(): Promise<SessionContext> {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("portal_user_id", context.userId)
    .maybeSingle();

  if (!contact) {
    redirect("/unauthorized");
  }

  return context;
}

export async function requireProjectCreator(): Promise<SessionContext> {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("can_create_projects", {
    org_id: context.organizationId
  });

  if (error || !data) {
    redirect("/unauthorized");
  }

  return context;
}

export async function requirePlatformAdminAccess(): Promise<PlatformAccessContext> {
  try {
    return await requirePlatformAccess();
  } catch (error) {
    if (error instanceof PlatformAccessError && error.status === 401) {
      redirect("/platform/login");
    }
    redirect("/unauthorized");
  }
}

export async function requirePlatformRoleKeys(
  allowedRoles: PlatformRoleKey[]
): Promise<PlatformAccessContext> {
  try {
    return await requirePlatformAccess(allowedRoles);
  } catch (error) {
    if (error instanceof PlatformAccessError && error.status === 401) {
      redirect("/platform/login");
    }
    redirect("/unauthorized");
  }
}
