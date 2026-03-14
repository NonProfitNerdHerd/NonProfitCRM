import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";

export type AnalyticsRangeKey = "30d" | "60d" | "90d" | "120d" | "1y" | "3y" | "5y";

export const ANALYTICS_RANGES: Array<{ key: AnalyticsRangeKey; label: string }> = [
  { key: "30d", label: "Last 30 days" },
  { key: "60d", label: "Last 60 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "120d", label: "Last 120 days" },
  { key: "1y", label: "Last Year" },
  { key: "3y", label: "Last 3 Years" },
  { key: "5y", label: "Last 5 Years" }
];

type TrendPoint = {
  bucket_start: string;
  total: number;
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

  const [personal, organizations] = await Promise.all([
    supabase.rpc("contact_trend_series", {
      org_id: context.organizationId,
      range_key: range,
      contact_mode: "personal"
    }),
    supabase.rpc("contact_trend_series", {
      org_id: context.organizationId,
      range_key: range,
      contact_mode: "organization"
    })
  ]);

  if (personal.error) throw personal.error;
  if (organizations.error) throw organizations.error;

  const mode = contactsGranularity(range);

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
      })) ?? []
  };
}

export async function getFinancialAnalytics(range: AnalyticsRangeKey) {
  const context = await requireStaffPermission("can_view_donations");
  const supabase = await createClient();

  const [{ data: trend, error: trendError }, { data: transactions, error: transactionsError }] =
    await Promise.all([
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
        .limit(30)
    ]);

  if (trendError) throw trendError;
  if (transactionsError) throw transactionsError;

  const mode = financialGranularity(range);

  return {
    range,
    granularity: mode,
    trend:
      (trend as TrendPoint[] | null | undefined)?.map((row) => ({
        x: row.bucket_start,
        label: formatShortDate(row.bucket_start, mode),
        y: Number(row.total)
      })) ?? [],
    recentTransactions: transactions ?? []
  };
}
