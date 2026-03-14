import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission, requirePortalIdentity } from "@/lib/auth/guards";

export async function listDonationsForStaff(filters?: {
  campaignId?: string;
  paymentType?: string;
  dateFrom?: string;
  dateTo?: string;
  donorId?: string;
  donorQuery?: string;
}) {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  let filteredDonationIds: string[] | null = null;
  if (filters?.campaignId) {
    const { data: allocationRows, error: allocationError } = await supabase
      .from("donation_allocations")
      .select("donation_id")
      .eq("organization_id", context.organizationId)
      .eq("campaign_id", filters.campaignId)
      .limit(1000);
    if (allocationError) throw allocationError;
    filteredDonationIds = Array.from(
      new Set((allocationRows ?? []).map((row) => row.donation_id as string))
    );
    if (filteredDonationIds.length === 0) return [];
  }

  let filteredDonorIds: string[] | null = null;
  if (filters?.donorId) {
    filteredDonorIds = [filters.donorId];
  } else if (filters?.donorQuery?.trim()) {
    const like = `%${filters.donorQuery.trim()}%`;
    const { data: donorRows, error: donorError } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", context.organizationId)
      .or(
        `first_name.ilike.${like},last_name.ilike.${like},preferred_name.ilike.${like},email.ilike.${like}`
      )
      .limit(300);
    if (donorError) throw donorError;
    filteredDonorIds = (donorRows ?? []).map((row) => row.id as string);
    if (filteredDonorIds.length === 0) return [];
  }

  let query = supabase
    .from("donations")
    .select(
      "id, amount, currency, donation_date, status, payment_type, check_number, transaction_id, source, created_by, created_at, campaign_id, campaigns(name,status), contacts(id,first_name,last_name,email), donation_allocations(campaign_id, allocation_amount, campaigns(id,name,status))"
    )
    .eq("organization_id", context.organizationId)
    .order("donation_date", { ascending: false })
    .limit(200);

  if (filteredDonationIds) query = query.in("id", filteredDonationIds);
  if (filteredDonorIds) query = query.in("contact_id", filteredDonorIds);
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
    .select(
      "id, amount, currency, donation_date, status, receipt_number, campaign_id, campaigns(name), donation_allocations(campaign_id, allocation_amount, campaigns(id,name,status))"
    )
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
    .select(
      "*, contacts(first_name,last_name,email), campaigns(name,status,start_date,end_date), donation_allocations(campaign_id, allocation_amount, campaigns(id,name,status,start_date,end_date))"
    )
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
