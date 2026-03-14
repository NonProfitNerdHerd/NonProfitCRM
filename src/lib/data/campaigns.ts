import { createClient } from "@/lib/supabase/server";
import { requireSessionContext, requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity-log";

export async function canCreateCampaigns() {
  const context = await requireSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_create_campaigns", {
    org_id: context.organizationId
  });
  if (error) throw error;
  return Boolean(data);
}

export async function listCampaigns(filters?: { status?: string; q?: string }) {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  let query = supabase
    .from("campaigns")
    .select("id, name, description, status, start_date, end_date, owner_user_id, created_at")
    .eq("organization_id", context.organizationId)
    .order("start_date", { ascending: false, nullsFirst: false });

  if (filters?.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }
  if (filters?.q) {
    const like = `%${filters.q}%`;
    query = query.or(`name.ilike.${like},description.ilike.${like}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createCampaign(input: {
  name: string;
  description?: string;
  status?: "Active" | "Inactive";
  startDate?: string;
  endDate?: string;
}) {
  const context = await requireSessionContext();
  const supabase = await createClient();
  const { data: allowed, error: allowedError } = await supabase.rpc("can_create_campaigns", {
    org_id: context.organizationId
  });
  if (allowedError) throw allowedError;
  if (!allowed) throw new Error("You are not allowed to create campaigns.");

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      organization_id: context.organizationId,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "Active",
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      owner_user_id: context.userId,
      created_by: context.userId
    })
    .select("id")
    .single();

  if (error) throw error;

  await recordActivity({
    entityType: "campaign",
    entityId: data.id,
    actionType: "created",
    actionSummary: `Created campaign ${input.name}`
  });

  return data.id;
}

export async function getCampaign(campaignId: string) {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  const [{ data: campaign, error: campaignError }, { data: donations, error: donationsError }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("id, name, description, status, start_date, end_date, owner_user_id, created_at")
        .eq("organization_id", context.organizationId)
        .eq("id", campaignId)
        .maybeSingle(),
      supabase
        .from("donations")
        .select(
          "id, donation_date, amount, payment_type, check_number, transaction_id, contact_id, contacts(first_name,last_name)"
        )
        .eq("organization_id", context.organizationId)
        .eq("campaign_id", campaignId)
        .order("donation_date", { ascending: false })
    ]);

  if (campaignError) throw campaignError;
  if (donationsError) throw donationsError;

  const totalAmount = (donations ?? []).reduce(
    (sum, donation) => sum + Number(donation.amount ?? 0),
    0
  );

  return {
    campaign,
    donations: donations ?? [],
    totalAmount
  };
}

export async function listActiveCampaigns() {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("organization_id", context.organizationId)
    .eq("status", "Active")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
