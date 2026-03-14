import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PermissionKey } from "@/types/database";

export type SessionContext = {
  userId: string;
  organizationId: string;
};

async function getActiveOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();

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
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("has_permission", {
    org_id: context.organizationId,
    permission_key: permission
  });

  if (error || !data) {
    redirect("/unauthorized");
  }

  return context;
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
