import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission, requirePortalIdentity } from "@/lib/auth/guards";

export type DonationRecord = {
  id: string;
  amount: number;
  currency: string | null;
  donation_date: string | null;
  status: string | null;
  receipt_number?: string | null;
  payment_type?: string | null;
  check_number?: string | null;
  transaction_id?: string | null;
  external_transaction_id?: string | null;
  source_platform?: string | null;
  source?: string | null;
  is_recurring?: boolean | null;
  crm_organization_id?: string | null;
  memo?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  campaign_id?: string | null;
  contacts?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  campaigns?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  donation_allocations?: Array<Record<string, unknown>> | null;
  [key: string]: unknown;
};

function isDonationOrgSchemaError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return message.includes("crm_organization_id") || message.includes("crm_organizations");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function listDonationsForStaff(filters?: {
  campaignId?: string;
  paymentType?: string;
  dateFrom?: string;
  dateTo?: string;
  donorId?: string;
  contactId?: string;
  donorQuery?: string;
  tagIds?: string[];
}): Promise<DonationRecord[]> {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();
  const { data: canViewPii } = await supabase.rpc("has_permission", {
    org_id: context.organizationId,
    permission_key: "can_view_pii"
  });
  const contactSelect = canViewPii
    ? "id,first_name,last_name,preferred_name,email,phone,organization_name,city,state"
    : "id,first_name,last_name,preferred_name,organization_name,city,state";

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
  if (filters?.contactId) {
    filteredDonorIds = [filters.contactId];
  } else if (filters?.donorId) {
    filteredDonorIds = [filters.donorId];
  } else if (filters?.donorQuery?.trim()) {
    const like = `%${filters.donorQuery.trim()}%`;
    const donorSearchClause = canViewPii
      ? `first_name.ilike.${like},last_name.ilike.${like},preferred_name.ilike.${like},email.ilike.${like}`
      : `first_name.ilike.${like},last_name.ilike.${like},preferred_name.ilike.${like},organization_name.ilike.${like}`;
    const { data: donorRows, error: donorError } = await supabase
      .from("contacts_safe_view")
      .select("id")
      .eq("organization_id", context.organizationId)
      .or(donorSearchClause)
      .limit(300);
    if (donorError) throw donorError;
    filteredDonorIds = (donorRows ?? []).map((row) => row.id as string);
    if (filteredDonorIds.length === 0) return [];
  }
  const tagIds = Array.from(
    new Set((filters?.tagIds ?? []).map((entry) => String(entry ?? "").trim()).filter(isUuid))
  );
  if (tagIds.length > 0) {
    const taggedContactIds = new Set<string>();
    let from = 0;
    const batchSize = 1000;
    while (true) {
      const { data: taggedRows, error: taggedError } = await supabase
        .from("contact_tags")
        .select("contact_id")
        .eq("organization_id", context.organizationId)
        .in("tag_id", tagIds)
        .range(from, from + batchSize - 1);
      if (taggedError) throw taggedError;
      const page = taggedRows ?? [];
      for (const row of page) {
        const contactId = String(row.contact_id ?? "").trim();
        if (contactId) taggedContactIds.add(contactId);
      }
      if (page.length < batchSize) break;
      from += batchSize;
    }
    if (taggedContactIds.size === 0) return [];
    if (filteredDonorIds) {
      filteredDonorIds = filteredDonorIds.filter((id) => taggedContactIds.has(id));
      if (filteredDonorIds.length === 0) return [];
    } else {
      filteredDonorIds = Array.from(taggedContactIds);
    }
  }

  async function runQuery(selectClause: string) {
    let query = supabase
      .from("donations")
      .select(selectClause)
      .eq("organization_id", context.organizationId)
      .order("donation_date", { ascending: false })
      .limit(200);

    if (filteredDonationIds) query = query.in("id", filteredDonationIds);
    if (filteredDonorIds) query = query.in("contact_id", filteredDonorIds);
    if (filters?.paymentType) query = query.eq("payment_type", filters.paymentType);
    if (filters?.dateFrom) query = query.gte("donation_date", filters.dateFrom);
    if (filters?.dateTo) query = query.lte("donation_date", filters.dateTo);

    return query;
  }

  const fullSelect =
    `id, amount, currency, donation_date, status, payment_type, check_number, transaction_id, source, source_platform, external_transaction_id, is_recurring, crm_organization_id, memo, created_by, created_at, campaign_id, campaigns(name,status), crm_organizations(id,name), contacts(${contactSelect}), donation_allocations(campaign_id, allocation_amount, campaigns(id,name,status))`;
  const legacySelect =
    `id, amount, currency, donation_date, status, payment_type, check_number, transaction_id, source, source_platform, external_transaction_id, is_recurring, memo, created_by, created_at, campaign_id, campaigns(name,status), contacts(${contactSelect}), donation_allocations(campaign_id, allocation_amount, campaigns(id,name,status))`;

  let { data, error } = await runQuery(fullSelect);
  if (error && isDonationOrgSchemaError(error)) {
    const fallbackResult = await runQuery(legacySelect);
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) throw error;
  return (data ?? []) as unknown as DonationRecord[];
}

export async function listPortalDonations(): Promise<DonationRecord[]> {
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
  return (data ?? []) as unknown as DonationRecord[];
}

export async function getDonationById(id: string): Promise<DonationRecord | null> {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();
  const { data: canViewPii } = await supabase.rpc("has_permission", {
    org_id: context.organizationId,
    permission_key: "can_view_pii"
  });
  const contactSelect = canViewPii
    ? "id,first_name,last_name,preferred_name,email,phone,organization_name,city,state"
    : "id,first_name,last_name,preferred_name,organization_name,city,state";

  const fullSelect =
    `*, contacts(${contactSelect}), crm_organizations(id,name,description), campaigns(name,status,start_date,end_date), donation_allocations(campaign_id, allocation_amount, campaigns(id,name,status,start_date,end_date))`;
  const legacySelect =
    `*, contacts(${contactSelect}), campaigns(name,status,start_date,end_date), donation_allocations(campaign_id, allocation_amount, campaigns(id,name,status,start_date,end_date))`;

  let { data, error } = await supabase
    .from("donations")
    .select(fullSelect)
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error && isDonationOrgSchemaError(error)) {
    const fallbackResult = await supabase
      .from("donations")
      .select(legacySelect)
      .eq("organization_id", context.organizationId)
      .eq("id", id)
      .maybeSingle();
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) throw error;
  return ((data as unknown as DonationRecord | null) ?? null) as DonationRecord | null;
}

export async function updateDonationForStaff(input: {
  donationId: string;
  contactId: string;
  organizationId?: string;
  date: string;
  totalAmount: number;
  paymentType: "Cash" | "Check" | "Card";
  checkNumber?: string;
  transactionId?: string;
  memo?: string;
  sourceSystem?: string;
  externalDonationId?: string;
  recurring?: boolean;
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

  const updatePayload = {
      contact_id: input.contactId,
      crm_organization_id: input.organizationId ?? null,
      campaign_id: primaryCampaignId,
      amount: input.totalAmount,
      donation_date: input.date,
      payment_type: input.paymentType,
      check_number: input.checkNumber ?? null,
      transaction_id: input.transactionId ?? null,
      memo: input.memo ?? null,
      source_platform: input.sourceSystem ?? null,
      external_transaction_id: input.externalDonationId ?? null,
      is_recurring: Boolean(input.recurring),
      campaign: primaryCampaign?.name ?? null,
      updated_at: new Date().toISOString()
  };

  let { error: donationUpdateError } = await supabase
    .from("donations")
    .update(updatePayload)
    .eq("organization_id", context.organizationId)
    .eq("id", input.donationId);

  if (donationUpdateError && isDonationOrgSchemaError(donationUpdateError)) {
    const { crm_organization_id: removedCrmOrgId, ...legacyUpdatePayload } = updatePayload;
    void removedCrmOrgId;
    const retryResult = await supabase
      .from("donations")
      .update(legacyUpdatePayload)
      .eq("organization_id", context.organizationId)
      .eq("id", input.donationId);
    donationUpdateError = retryResult.error;
  }
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

export async function createDonationForStaff(input: {
  contactId: string;
  organizationId?: string;
  date: string;
  totalAmount: number;
  paymentType: "Cash" | "Check" | "Card";
  allocations: Array<{ campaignId: string; amount: number }>;
  checkNumber?: string;
  transactionId?: string;
  memo?: string;
  sourceSystem?: string;
  externalDonationId?: string;
  recurring?: boolean;
}) {
  const context = await requireStaffPermission("can_create_donations");
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

  const campaignIds = Array.from(new Set(input.allocations.map((allocation) => allocation.campaignId)));
  const { data: campaigns, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("organization_id", context.organizationId)
    .in("id", campaignIds);
  if (campaignError) throw campaignError;
  if (!campaigns || campaigns.length !== campaignIds.length) {
    throw new Error("One or more selected campaigns are not valid.");
  }
  if (campaigns.some((campaign) => campaign.status !== "Active")) {
    throw new Error("Donation must be tied to an active campaign.");
  }

  const primaryCampaignId = input.allocations[0]?.campaignId;
  const primaryCampaign = campaigns.find((campaign) => campaign.id === primaryCampaignId);

  const insertPayload = {
      organization_id: context.organizationId,
      contact_id: input.contactId,
      crm_organization_id: input.organizationId ?? null,
      campaign_id: primaryCampaignId,
      amount: input.totalAmount,
      currency: "USD",
      donation_date: input.date,
      status: "posted",
      payment_type: input.paymentType,
      check_number: input.checkNumber ?? null,
      transaction_id: input.transactionId ?? null,
      memo: input.memo ?? null,
      source: "manual",
      source_platform: input.sourceSystem ?? null,
      external_transaction_id: input.externalDonationId ?? null,
      is_recurring: Boolean(input.recurring),
      campaign: primaryCampaign?.name ?? null,
      created_by: context.userId
  };

  let { data, error } = await supabase.from("donations").insert(insertPayload).select("id").single();
  if (error && isDonationOrgSchemaError(error)) {
    const { crm_organization_id: removedCrmOrgId, ...legacyInsertPayload } = insertPayload;
    void removedCrmOrgId;
    const retryResult = await supabase
      .from("donations")
      .insert(legacyInsertPayload)
      .select("id")
      .single();
    data = retryResult.data;
    error = retryResult.error;
  }
  if (error) throw error;
  if (!data?.id) throw new Error("Donation insert did not return an id.");

  const { error: allocationsError } = await supabase.from("donation_allocations").upsert(
    input.allocations.map((allocation) => ({
      organization_id: context.organizationId,
      donation_id: data.id,
      campaign_id: allocation.campaignId,
      allocation_amount: allocation.amount,
      created_by: context.userId
    })),
    { onConflict: "donation_id,campaign_id" }
  );
  if (allocationsError) throw allocationsError;

  return data.id;
}
