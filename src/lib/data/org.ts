import { createClient } from "@/lib/supabase/server";

export async function getActiveOrganizationId(userId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.default_organization_id) {
    return profile.default_organization_id;
  }

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return membership?.organization_id ?? null;
}
