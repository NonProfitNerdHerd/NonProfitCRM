import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";

type TrendPoint = { label: string; y: number };

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function lastNMonthKeys(count: number) {
  const now = new Date();
  const keys: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    keys.push(monthKey(date));
  }
  return keys;
}

function trendFromMap(months: string[], totals: Map<string, number>): TrendPoint[] {
  return months.map((month) => ({
    label: monthLabel(month),
    y: totals.get(month) ?? 0
  }));
}

export async function getExecutiveReportsData() {
  await requireStaffPermission("can_run_reports");
  const context = await requireStaffPermission("can_view_financial_summaries");
  const supabase = await createClient();
  const monthKeys = lastNMonthKeys(12);

  const [
    donationTrendResult,
    contactsResult,
    membershipsResult,
    campaignsResult,
    projectsResult
  ] = await Promise.all([
    supabase.rpc("donation_trend_series", {
      org_id: context.organizationId,
      range_key: "1y"
    }),
    supabase
      .from("contacts")
      .select("id, created_at, tracking_status")
      .eq("organization_id", context.organizationId)
      .order("created_at", { ascending: true })
      .limit(30000),
    supabase
      .from("memberships")
      .select("start_date")
      .eq("organization_id", context.organizationId)
      .limit(30000),
    supabase
      .from("campaigns")
      .select("id, status")
      .eq("organization_id", context.organizationId)
      .limit(10000),
    supabase
      .from("projects")
      .select("id, status")
      .eq("organization_id", context.organizationId)
      .limit(10000)
  ]);

  if (donationTrendResult.error) throw donationTrendResult.error;
  if (contactsResult.error) throw contactsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;
  if (campaignsResult.error) throw campaignsResult.error;
  if (projectsResult.error) throw projectsResult.error;

  const donationMonthMap = new Map<string, number>();
  for (const row of donationTrendResult.data ?? []) {
    donationMonthMap.set(String(row.bucket_start).slice(0, 7), Number(row.total ?? 0));
  }

  const contactsMonthMap = new Map<string, number>();
  const donorCreatedMonthMap = new Map<string, number>();
  for (const row of contactsResult.data ?? []) {
    const key = String(row.created_at ?? "").slice(0, 7);
    if (!key) continue;
    contactsMonthMap.set(key, (contactsMonthMap.get(key) ?? 0) + 1);
    if (String(row.tracking_status ?? "").toLowerCase() === "donor") {
      donorCreatedMonthMap.set(key, (donorCreatedMonthMap.get(key) ?? 0) + 1);
    }
  }

  const donorGrowthMap = new Map<string, number>();
  let cumulativeDonors = 0;
  for (const month of monthKeys) {
    cumulativeDonors += donorCreatedMonthMap.get(month) ?? 0;
    donorGrowthMap.set(month, cumulativeDonors);
  }

  const membershipMonthMap = new Map<string, number>();
  for (const membership of membershipsResult.data ?? []) {
    const key = String(membership.start_date ?? "").slice(0, 7);
    if (!key) continue;
    membershipMonthMap.set(key, (membershipMonthMap.get(key) ?? 0) + 1);
  }

  const activeCampaigns = (campaignsResult.data ?? []).filter(
    (campaign) => String(campaign.status).toLowerCase() === "active"
  ).length;

  const projectStatusSummary = (projectsResult.data ?? []).reduce(
    (summary, project) => {
      const key = String(project.status ?? "Unknown");
      summary[key] = (summary[key] ?? 0) + 1;
      return summary;
    },
    {} as Record<string, number>
  );

  return {
    generatedAt: new Date().toISOString(),
    donationGrowth: trendFromMap(monthKeys, donationMonthMap),
    contactGrowth: trendFromMap(monthKeys, contactsMonthMap),
    donorGrowth: trendFromMap(monthKeys, donorGrowthMap),
    membershipGrowth: trendFromMap(monthKeys, membershipMonthMap),
    activeCampaignSummary: {
      totalCampaigns: campaignsResult.data?.length ?? 0,
      activeCampaigns
    },
    projectStatusSummary
  };
}
