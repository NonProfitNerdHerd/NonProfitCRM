import { createClient } from "@/lib/supabase/server";
import { PermissionKey } from "@/types/database";

export async function getUserPermissions(
  organizationId: string
): Promise<PermissionKey[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("user_permissions", {
    org_id: organizationId
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data as PermissionKey[];
}

export async function can(
  organizationId: string,
  permissionKey: PermissionKey
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    org_id: organizationId,
    permission_key: permissionKey
  });

  return !error && Boolean(data);
}
