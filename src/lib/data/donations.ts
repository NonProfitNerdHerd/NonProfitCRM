import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission, requirePortalIdentity } from "@/lib/auth/guards";

export async function listDonationsForStaff(filters?: {
  campaignId?: string;
  paymentType?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  let query = supabase
    .from("donations")
    .select(
      "id, amount, currency, donation_date, status, payment_type, check_number, transaction_id, source, created_by, created_at, campaign_id, campaigns(name,status), contacts(first_name,last_name)"
    )
    .eq("organization_id", context.organizationId)
    .order("donation_date", { ascending: false })
    .limit(200);

  if (filters?.campaignId) query = query.eq("campaign_id", filters.campaignId);
  if (filters?.paymentType) query = query.eq("payment_type", filters.paymentType);
  if (filters?.dateFrom) query = query.gte("donation_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("donation_date", filters.dateTo);

  const { data, error } = await query;

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

  if (!contact) return [];

  const { data, error } = await supabase
    .from("donations")
    .select("id, amount, currency, donation_date, status, receipt_number, campaign_id, campaigns(name)")
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
    .select("*, contacts(first_name,last_name,email), campaigns(name,status,start_date,end_date)")
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
