import { createClient } from "@/lib/supabase/server";
import { requirePortalIdentity, requireStaffPermission } from "@/lib/auth/guards";

export async function listMembershipsForStaff() {
  const context = await requireStaffPermission("can_manage_memberships");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, status, level, start_date, renewal_date, contacts(first_name,last_name), membership_types(name)"
    )
    .eq("organization_id", context.organizationId)
    .order("renewal_date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getMembership(id: string) {
  const context = await requireStaffPermission("can_manage_memberships");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("*, contacts(first_name,last_name,email), membership_types(name, benefits)")
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listPortalMemberships() {
  const context = await requirePortalIdentity();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("portal_user_id", context.userId)
    .single();

  if (!contact) return [];

  const { data, error } = await supabase
    .from("memberships")
    .select("id, status, level, start_date, end_date, renewal_date, membership_types(name)")
    .eq("organization_id", context.organizationId)
    .eq("contact_id", contact.id)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
