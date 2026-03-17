import { createClient } from "@/lib/supabase/server";

export type PlatformRoleKey =
  | "super_admin"
  | "build_team_admin"
  | "support_admin"
  | "billing_admin"
  | "internal_auditor"
  | "implementation_specialist";

export type PlatformAccessContext = {
  userId: string;
  roles: PlatformRoleKey[];
};

export class PlatformAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

function normalizeRole(input: unknown): PlatformRoleKey | null {
  const value = String(input ?? "").trim().toLowerCase();
  if (
    value === "super_admin" ||
    value === "build_team_admin" ||
    value === "support_admin" ||
    value === "billing_admin" ||
    value === "internal_auditor" ||
    value === "implementation_specialist"
  ) {
    return value;
  }
  return null;
}

export async function requirePlatformAccess(
  requiredRoles?: PlatformRoleKey[]
): Promise<PlatformAccessContext> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new PlatformAccessError("Authentication required.", 401);
  }

  const { data, error } = await supabase
    .from("platform_admin_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error) {
    throw new PlatformAccessError(error.message || "Unable to validate platform access.", 403);
  }

  const roles = (data ?? [])
    .map((entry) => normalizeRole(entry.role))
    .filter((value): value is PlatformRoleKey => Boolean(value));

  if (roles.length === 0) {
    throw new PlatformAccessError("Platform admin access is required.", 403);
  }

  if (requiredRoles?.length) {
    const allowed = roles.some((role) => requiredRoles.includes(role));
    if (!allowed) {
      throw new PlatformAccessError("Insufficient platform permissions.", 403);
    }
  }

  return {
    userId: user.id,
    roles
  };
}

export function platformRoleRank(role: PlatformRoleKey) {
  switch (role) {
    case "super_admin":
      return 100;
    case "build_team_admin":
      return 90;
    case "support_admin":
      return 80;
    case "billing_admin":
      return 70;
    case "internal_auditor":
      return 60;
    case "implementation_specialist":
      return 50;
    default:
      return 0;
  }
}
