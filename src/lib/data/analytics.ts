import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { type AnalyticsRangeKey } from "@/lib/analytics/config";

type TrendPoint = {
  bucket_start: string;
  total: number;
};

type DistributionPoint = {
  label: string;
  amount: number;
  percentage: number;
};

type CampaignDistributionRow = {
  campaign_id: string;
  campaign_name: string;
  total: number | string;
};

type PaymentDistributionRow = {
  payment_type: string;
  total: number | string;
};

type LatestActivityRow = {
  related_contact_id: string | null;
  action_type: string;
  action_summary: string;
  created_at: string;
  performed_by_user_id: string | null;
  contacts:
    | {
        id: string;
        first_name: string | null;
        last_name: string | null;
        organization_name: string | null;
      }
    | Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        organization_name: string | null;
      }>
    | null;
};

function formatShortDate(input: string, mode: "day" | "week" | "month" | "year") {
  const date = new Date(`${input}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();

  if (mode === "year") return `${year}`;
  if (mode === "month") return `${month} ${year}`;
  if (mode === "week") return `Week of ${month} ${day}`;
  return `${month} ${day}`;
}

function formatDateTime(input: string) {
  const date = new Date(input);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function contactsGranularity(range: AnalyticsRangeKey): "day" | "week" | "month" | "year" {
  if (range === "30d") return "day";
  if (range === "60d" || range === "90d" || range === "120d") return "week";
  if (range === "5y") return "year";
  return "month";
}

function financialGranularity(range: AnalyticsRangeKey): "day" | "week" | "month" | "year" {
  if (range === "30d") return "day";
  if (range === "60d") return "week";
  if (range === "5y") return "year";
  return "month";
}

export async function getContactAnalytics(range: AnalyticsRangeKey) {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  const [personal, organizations, activityRowsResult] = await Promise.all([
    supabase.rpc("contact_trend_series", {
      org_id: context.organizationId,
      range_key: range,
      contact_mode: "personal"
    }),
    supabase.rpc("contact_trend_series", {
      org_id: context.organizationId,
      range_key: range,
      contact_mode: "organization"
    }),
    supabase
      .from("activity_log")
      .select(
        "related_contact_id, action_type, action_summary, created_at, performed_by_user_id, contacts(id, first_name, last_name, organization_name)"
      )
      .eq("organization_id", context.organizationId)
      .not("related_contact_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500)
  ]);

  if (personal.error) throw personal.error;
  if (organizations.error) throw organizations.error;
  if (activityRowsResult.error) throw activityRowsResult.error;

  const mode = contactsGranularity(range);
  const activityRows = (activityRowsResult.data as LatestActivityRow[] | null | undefined) ?? [];

  const latestByContact = new Map<string, LatestActivityRow>();
  for (const row of activityRows) {
    const contactId = row.related_contact_id;
    if (!contactId) continue;
    if (!latestByContact.has(contactId)) {
      latestByContact.set(contactId, row);
    }
  }

  const performerIds = Array.from(
    new Set(
      Array.from(latestByContact.values())
        .map((row) => row.performed_by_user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const profilesResult = performerIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name, email")
        .in("id", performerIds)
    : { data: [] as Array<Record<string, unknown>>, error: null };
  if (profilesResult.error) throw profilesResult.error;

  const performerMap = new Map<string, string>();
  for (const profile of profilesResult.data ?? []) {
    const id = profile.id as string;
    const displayName =
      (profile.display_name as string) ||
      [profile.first_name as string, profile.last_name as string].filter(Boolean).join(" ") ||
      (profile.email as string) ||
      id;
    performerMap.set(id, displayName);
  }

  const latestModifiedContacts = Array.from(latestByContact.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30)
    .map((row) => {
      if (!row.related_contact_id) return null;
      const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
      const contactType: "Personal" | "Organization" =
        contact?.organization_name && String(contact.organization_name).trim().length > 0
          ? "Organization"
          : "Personal";
      const contactName =
        [
          contact?.first_name ?? "",
          contact?.last_name ?? ""
        ]
          .join(" ")
          .trim() || "Unnamed Contact";

      return {
        contactId: row.related_contact_id,
        contactName,
        contactType,
        mostRecentActivityType: row.action_type,
        mostRecentActivityDateTime: row.created_at,
        mostRecentActivityDateTimeLabel: formatDateTime(row.created_at),
        modifiedBy: row.performed_by_user_id
          ? performerMap.get(row.performed_by_user_id) ?? row.performed_by_user_id
          : "Unknown",
        summary: row.action_summary
      };
    })
    .filter(
      (
        row
      ): row is {
        contactId: string;
        contactName: string;
        contactType: "Personal" | "Organization";
        mostRecentActivityType: string;
        mostRecentActivityDateTime: string;
        mostRecentActivityDateTimeLabel: string;
        modifiedBy: string;
        summary: string;
      } => Boolean(row)
    );

  return {
    range,
    granularity: mode,
    personal: (personal.data as TrendPoint[] | null | undefined)?.map((row) => ({
      x: row.bucket_start,
      label: formatShortDate(row.bucket_start, mode),
      y: Number(row.total)
    })) ?? [],
    organizations:
      (organizations.data as TrendPoint[] | null | undefined)?.map((row) => ({
        x: row.bucket_start,
        label: formatShortDate(row.bucket_start, mode),
        y: Number(row.total)
      })) ?? [],
    latestModifiedContacts
  };
}

export async function getFinancialAnalytics(range: AnalyticsRangeKey) {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  const [
    { data: trend, error: trendError },
    { data: transactions, error: transactionsError },
    { data: campaignDistributionRaw, error: campaignDistributionError },
    { data: paymentTypeDistributionRaw, error: paymentTypeDistributionError }
  ] = await Promise.all([
    supabase.rpc("donation_trend_series", {
      org_id: context.organizationId,
      range_key: range
    }),
    supabase
      .from("donations")
      .select(
        "id, donation_date, amount, payment_type, contact_id, campaign_id, contacts(first_name,last_name), campaigns(name)"
      )
      .eq("organization_id", context.organizationId)
      .order("donation_date", { ascending: false })
      .limit(30),
    supabase.rpc("campaign_fund_distribution", {
      org_id: context.organizationId,
      range_key: range
    }),
    supabase.rpc("payment_type_distribution", {
      org_id: context.organizationId,
      range_key: range
    })
  ]);

  if (trendError) throw trendError;
  if (transactionsError) throw transactionsError;
  if (campaignDistributionError) throw campaignDistributionError;
  if (paymentTypeDistributionError) throw paymentTypeDistributionError;

  const mode = financialGranularity(range);
  const campaignRows =
    (campaignDistributionRaw as CampaignDistributionRow[] | null | undefined) ?? [];
  const paymentRows =
    (paymentTypeDistributionRaw as PaymentDistributionRow[] | null | undefined) ?? [];
  const totalFunds = campaignRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);

  const campaignDistribution: DistributionPoint[] = campaignRows.map((row) => ({
    label: row.campaign_name || "Unassigned Campaign",
    amount: Number(row.total ?? 0),
    percentage: totalFunds > 0 ? (Number(row.total ?? 0) / totalFunds) * 100 : 0
  }));

  const normalizedPaymentMap = new Map<string, number>([
    ["Cash", 0],
    ["Credit", 0],
    ["Check", 0]
  ]);
  for (const row of paymentRows) {
    const key = String(row.payment_type ?? "").toLowerCase();
    const normalized =
      key === "card" || key === "credit" || key === "credit_card"
        ? "Credit"
        : key === "check"
          ? "Check"
          : key === "cash"
            ? "Cash"
            : key
              ? key.charAt(0).toUpperCase() + key.slice(1)
              : "Unknown";
    normalizedPaymentMap.set(
      normalized,
      (normalizedPaymentMap.get(normalized) ?? 0) + Number(row.total ?? 0)
    );
  }
  const paymentTotal = Array.from(normalizedPaymentMap.values()).reduce(
    (sum, value) => sum + value,
    0
  );
  const transactionTypeDistribution: DistributionPoint[] = Array.from(
    normalizedPaymentMap.entries()
  )
    .map(([label, amount]) => ({
      label,
      amount,
      percentage: paymentTotal > 0 ? (amount / paymentTotal) * 100 : 0
    }))
    .filter((entry) => entry.amount > 0 || ["Cash", "Credit", "Check"].includes(entry.label));

  return {
    range,
    granularity: mode,
    trend:
      (trend as TrendPoint[] | null | undefined)?.map((row) => ({
        x: row.bucket_start,
        label: formatShortDate(row.bucket_start, mode),
        y: Number(row.total)
      })) ?? [],
    campaignDistribution,
    transactionTypeDistribution,
    totalDonations: totalFunds,
    recentTransactions: transactions ?? []
  };
}
