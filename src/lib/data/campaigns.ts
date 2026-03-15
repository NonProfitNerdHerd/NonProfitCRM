import { createClient } from "@/lib/supabase/server";
import { requireSessionContext, requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity-log";

type CampaignInput = {
  name: string;
  description?: string;
  status?: "Active" | "Inactive";
  startDate?: string;
  endDate?: string;
};

function ensureDateOrder(startDate?: string, endDate?: string) {
  if (startDate && endDate && endDate < startDate) {
    throw new Error("End Date cannot be before Start Date.");
  }
}

function ensureChildWithinParentDates(input: {
  parentStartDate: string | null;
  parentEndDate: string | null;
  childStartDate: string;
  childEndDate: string;
}) {
  if (!input.childStartDate || !input.childEndDate) {
    throw new Error("Child Campaign Start Date and End Date are required.");
  }
  if (input.childEndDate < input.childStartDate) {
    throw new Error("Child Campaign End Date cannot be before Start Date.");
  }
  if (input.parentStartDate && input.childStartDate < input.parentStartDate) {
    throw new Error("Child Campaign Start Date must be within Parent Campaign date range.");
  }
  if (input.parentEndDate && input.childEndDate > input.parentEndDate) {
    throw new Error("Child Campaign End Date must be within Parent Campaign date range.");
  }
}

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

  let parentQuery = supabase
    .from("campaigns")
    .select("id, name, description, status, start_date, end_date, owner_user_id, created_at")
    .eq("organization_id", context.organizationId)
    .order("start_date", { ascending: false, nullsFirst: false });
  let childQuery = supabase
    .from("sub_campaigns")
    .select("id, campaign_id, name, description, status, start_date, end_date, created_at")
    .eq("organization_id", context.organizationId)
    .order("name", { ascending: true });

  if (filters?.status && filters.status !== "All") {
    parentQuery = parentQuery.eq("status", filters.status);
    childQuery = childQuery.eq("status", filters.status);
  }

  const [{ data: parents, error: parentError }, { data: children, error: childError }] =
    await Promise.all([parentQuery, childQuery]);
  if (parentError) throw parentError;
  if (childError) throw childError;

  const q = filters?.q?.trim().toLowerCase() ?? "";
  const parentRows = (parents ?? []) as Array<Record<string, unknown>>;
  const childRows = (children ?? []) as Array<Record<string, unknown>>;

  const childrenByParent = new Map<string, Array<Record<string, unknown>>>();
  for (const child of childRows) {
    const parentId = String(child.campaign_id ?? "");
    if (!parentId) continue;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(child);
    childrenByParent.set(parentId, list);
  }

  const flattened: Array<Record<string, unknown>> = [];
  for (const parent of parentRows) {
    const parentId = String(parent.id ?? "");
    const parentChildren = childrenByParent.get(parentId) ?? [];
    const parentMatches =
      q.length === 0 ||
      String(parent.name ?? "")
        .toLowerCase()
        .includes(q) ||
      String(parent.description ?? "")
        .toLowerCase()
        .includes(q);
    const matchingChildren =
      q.length === 0
        ? parentChildren
        : parentChildren.filter((child) => {
            return (
              String(child.name ?? "")
                .toLowerCase()
                .includes(q) ||
              String(child.description ?? "")
                .toLowerCase()
                .includes(q)
            );
          });

    if (!parentMatches && matchingChildren.length === 0) continue;

    flattened.push({
      ...parent,
      is_child: false,
      parent_campaign_id: null,
      parent_campaign_name: null
    });

    for (const child of matchingChildren) {
      flattened.push({
        id: child.id,
        name: child.name,
        description: child.description,
        status: child.status,
        start_date: child.start_date,
        end_date: child.end_date,
        created_at: child.created_at,
        is_child: true,
        parent_campaign_id: parent.id,
        parent_campaign_name: parent.name
      });
    }
  }

  return flattened;
}

export async function createCampaign(input: CampaignInput) {
  const context = await requireSessionContext();
  const supabase = await createClient();
  const { data: allowed, error: allowedError } = await supabase.rpc("can_create_campaigns", {
    org_id: context.organizationId
  });
  if (allowedError) throw allowedError;
  if (!allowed) throw new Error("You are not allowed to create campaigns.");
  ensureDateOrder(input.startDate, input.endDate);

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

export async function updateCampaign(campaignId: string, input: CampaignInput) {
  const context = await requireSessionContext();
  const supabase = await createClient();
  const { data: allowed, error: allowedError } = await supabase.rpc("can_create_campaigns", {
    org_id: context.organizationId
  });
  if (allowedError) throw allowedError;
  if (!allowed) throw new Error("You are not allowed to edit campaigns.");

  ensureDateOrder(input.startDate, input.endDate);

  const [{ data: campaign, error: campaignError }, { data: childCampaigns, error: childError }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("id, name")
        .eq("organization_id", context.organizationId)
        .eq("id", campaignId)
        .maybeSingle(),
      supabase
        .from("sub_campaigns")
        .select("id, name, start_date, end_date")
        .eq("organization_id", context.organizationId)
        .eq("campaign_id", campaignId)
    ]);
  if (campaignError) throw campaignError;
  if (childError) throw childError;
  if (!campaign) throw new Error("Campaign not found.");

  for (const child of childCampaigns ?? []) {
    const childStart = typeof child.start_date === "string" ? child.start_date : "";
    const childEnd = typeof child.end_date === "string" ? child.end_date : "";
    if (!childStart || !childEnd) {
      throw new Error(
        `Child campaign "${String(child.name ?? "Unknown")}" is missing dates. Please update child campaign dates before editing parent date range.`
      );
    }
    if (input.startDate && childStart < input.startDate) {
      throw new Error(
        `Child campaign "${String(child.name ?? "Unknown")}" starts before the parent campaign start date.`
      );
    }
    if (input.endDate && childEnd > input.endDate) {
      throw new Error(
        `Child campaign "${String(child.name ?? "Unknown")}" ends after the parent campaign end date.`
      );
    }
  }

  const { error } = await supabase
    .from("campaigns")
    .update({
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "Active",
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null
    })
    .eq("organization_id", context.organizationId)
    .eq("id", campaignId);
  if (error) throw error;

  await recordActivity({
    entityType: "campaign",
    entityId: campaignId,
    actionType: "updated",
    actionSummary: `Updated campaign ${input.name}`
  });
}

export async function createChildCampaign(parentCampaignId: string, input: CampaignInput) {
  const context = await requireSessionContext();
  const supabase = await createClient();
  const { data: allowed, error: allowedError } = await supabase.rpc("can_create_campaigns", {
    org_id: context.organizationId
  });
  if (allowedError) throw allowedError;
  if (!allowed) throw new Error("You are not allowed to create campaigns.");

  const { data: parentCampaign, error: parentError } = await supabase
    .from("campaigns")
    .select("id, name, start_date, end_date")
    .eq("organization_id", context.organizationId)
    .eq("id", parentCampaignId)
    .maybeSingle();
  if (parentError) throw parentError;
  if (!parentCampaign) throw new Error("Parent campaign not found.");

  ensureChildWithinParentDates({
    parentStartDate: parentCampaign.start_date as string | null,
    parentEndDate: parentCampaign.end_date as string | null,
    childStartDate: input.startDate ?? "",
    childEndDate: input.endDate ?? ""
  });

  const { data, error } = await supabase
    .from("sub_campaigns")
    .insert({
      organization_id: context.organizationId,
      campaign_id: parentCampaignId,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "Active",
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      created_by: context.userId,
      updated_by: context.userId
    })
    .select("id")
    .single();
  if (error) throw error;

  await recordActivity({
    entityType: "sub_campaign",
    entityId: data.id,
    actionType: "created",
    actionSummary: `Created child campaign ${input.name} under ${String(parentCampaign.name ?? "parent campaign")}`
  });

  return data.id;
}

export async function updateChildCampaign(
  parentCampaignId: string,
  childCampaignId: string,
  input: CampaignInput
) {
  const context = await requireSessionContext();
  const supabase = await createClient();
  const { data: allowed, error: allowedError } = await supabase.rpc("can_create_campaigns", {
    org_id: context.organizationId
  });
  if (allowedError) throw allowedError;
  if (!allowed) throw new Error("You are not allowed to edit campaigns.");

  const [{ data: parentCampaign, error: parentError }, { data: childCampaign, error: childError }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("id, name, start_date, end_date")
        .eq("organization_id", context.organizationId)
        .eq("id", parentCampaignId)
        .maybeSingle(),
      supabase
        .from("sub_campaigns")
        .select("id, campaign_id")
        .eq("organization_id", context.organizationId)
        .eq("id", childCampaignId)
        .maybeSingle()
    ]);
  if (parentError) throw parentError;
  if (childError) throw childError;
  if (!parentCampaign) throw new Error("Parent campaign not found.");
  if (!childCampaign || String(childCampaign.campaign_id) !== parentCampaignId) {
    throw new Error("Child campaign not found for this parent campaign.");
  }

  ensureChildWithinParentDates({
    parentStartDate: parentCampaign.start_date as string | null,
    parentEndDate: parentCampaign.end_date as string | null,
    childStartDate: input.startDate ?? "",
    childEndDate: input.endDate ?? ""
  });

  const { error } = await supabase
    .from("sub_campaigns")
    .update({
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "Active",
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      updated_by: context.userId
    })
    .eq("organization_id", context.organizationId)
    .eq("id", childCampaignId);
  if (error) throw error;

  await recordActivity({
    entityType: "sub_campaign",
    entityId: childCampaignId,
    actionType: "updated",
    actionSummary: `Updated child campaign ${input.name}`
  });
}

export async function getCampaign(campaignId: string) {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  const [
    { data: campaign, error: campaignError },
    { data: donations, error: donationsError },
    { data: childCampaigns, error: childCampaignsError }
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, description, status, start_date, end_date, owner_user_id, created_at")
      .eq("organization_id", context.organizationId)
      .eq("id", campaignId)
      .maybeSingle(),
    supabase
      .from("donations")
      .select(
        "id, donation_date, amount, payment_type, check_number, transaction_id, contact_id, sub_campaign_id, contacts(first_name,last_name), sub_campaigns(name)"
      )
      .eq("organization_id", context.organizationId)
      .eq("campaign_id", campaignId)
      .order("donation_date", { ascending: false }),
    supabase
      .from("sub_campaigns")
      .select("id, campaign_id, name, description, status, start_date, end_date, created_at")
      .eq("organization_id", context.organizationId)
      .eq("campaign_id", campaignId)
      .order("name", { ascending: true })
  ]);

  if (campaignError) throw campaignError;
  if (donationsError) throw donationsError;
  if (childCampaignsError) throw childCampaignsError;

  const donationsRows = (donations ?? []) as Array<Record<string, unknown>>;
  const childRows = (childCampaigns ?? []) as Array<Record<string, unknown>>;

  const totalAmount = donationsRows.reduce(
    (sum, donation) => sum + Number(donation.amount ?? 0),
    0
  );
  const childTotals = new Map<string, number>();
  for (const donation of donationsRows) {
    const childId = String(donation.sub_campaign_id ?? "");
    if (!childId) continue;
    const current = childTotals.get(childId) ?? 0;
    childTotals.set(childId, current + Number(donation.amount ?? 0));
  }

  return {
    campaign,
    donations: donationsRows,
    totalAmount,
    childCampaigns: childRows.map((row) => ({
      ...row,
      total_amount: childTotals.get(String(row.id ?? "")) ?? 0
    }))
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
