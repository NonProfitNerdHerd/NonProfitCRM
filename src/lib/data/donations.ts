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

export async function updateDonationForStaff(input: {
  donationId: string;
  contactId: string;
  date: string;
  totalAmount: number;
  paymentType: "Cash" | "Check" | "Card";
  checkNumber?: string;
  transactionId?: string;
  memo?: string;
  allocations: Array<{ campaignId: string; amount: number }>;
}) {
  const context = await requireStaffPermission("can_edit_donations");
  const supabase = await createClient();

  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    throw new Error("Total Donation Amount is required.");
  }
  if (!input.allocations.length) {
    throw new Error("At least one campaign allocation is required.");
  }
  const allocatedTotal = input.allocations.reduce(
    (sum, allocation) => sum + Number(allocation.amount || 0),
    0
  );
  if (Math.abs(allocatedTotal - input.totalAmount) > 0.009) {
    throw new Error("Split allocations must exactly match Total Donation Amount.");
  }

  const { data: existingDonation, error: donationLookupError } = await supabase
    .from("donations")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", input.donationId)
    .maybeSingle();
  if (donationLookupError) throw donationLookupError;
  if (!existingDonation) throw new Error("Donation not found.");

  const campaignIds = Array.from(new Set(input.allocations.map((allocation) => allocation.campaignId)));
  const { data: campaigns, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("organization_id", context.organizationId)
    .in("id", campaignIds);
  if (campaignError) throw campaignError;
  if (!campaigns || campaigns.length !== campaignIds.length) {
    throw new Error("One or more selected campaigns are invalid.");
  }
  if (campaigns.some((campaign) => campaign.status !== "Active")) {
    throw new Error("Donation allocations must use active campaigns.");
  }

  const primaryCampaignId = input.allocations[0].campaignId;
  const primaryCampaign = campaigns.find((campaign) => campaign.id === primaryCampaignId);

  const { error: donationUpdateError } = await supabase
    .from("donations")
    .update({
      contact_id: input.contactId,
      campaign_id: primaryCampaignId,
      amount: input.totalAmount,
      donation_date: input.date,
      payment_type: input.paymentType,
      check_number: input.checkNumber ?? null,
      transaction_id: input.transactionId ?? null,
      memo: input.memo ?? null,
      campaign: primaryCampaign?.name ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("id", input.donationId);
  if (donationUpdateError) throw donationUpdateError;

  const { error: allocationsUpsertError } = await supabase.from("donation_allocations").upsert(
    input.allocations.map((allocation) => ({
      organization_id: context.organizationId,
      donation_id: input.donationId,
      campaign_id: allocation.campaignId,
      allocation_amount: allocation.amount,
      created_by: context.userId
    })),
    { onConflict: "donation_id,campaign_id" }
  );
  if (allocationsUpsertError) throw allocationsUpsertError;

  const { data: existingAllocations, error: existingAllocationsError } = await supabase
    .from("donation_allocations")
    .select("campaign_id")
    .eq("organization_id", context.organizationId)
    .eq("donation_id", input.donationId);
  if (existingAllocationsError) throw existingAllocationsError;
  const removeCampaignIds = (existingAllocations ?? [])
    .map((row) => row.campaign_id as string)
    .filter((campaignId) => !campaignIds.includes(campaignId));
  if (removeCampaignIds.length > 0) {
    const { error: cleanupError } = await supabase
      .from("donation_allocations")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("donation_id", input.donationId)
      .in("campaign_id", removeCampaignIds);
    if (cleanupError) throw cleanupError;
  }
}
