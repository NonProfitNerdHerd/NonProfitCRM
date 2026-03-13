import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission, requirePortalIdentity } from "@/lib/auth/guards";

export async function listDonationsForStaff() {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("donations")
    .select("id, amount, currency, donation_date, status, source, contacts(first_name,last_name)")
    .eq("organization_id", context.organizationId)
    .order("donation_date", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

export async function listPortalDonations() {
  const context = await requirePortalIdentity();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("portal_user_id", context.userId)
    .single();

  const { data, error } = await supabase
    .from("donations")
    .select("id, amount, currency, donation_date, status, receipt_number")
    .eq("organization_id", context.organizationId)
    .eq("contact_id", contact.id)
    .order("donation_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDonationById(id: string) {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("donations")
    .select("*, contacts(first_name,last_name,email)")
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
