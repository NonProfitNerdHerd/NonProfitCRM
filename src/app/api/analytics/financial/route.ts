import { NextResponse } from "next/server";
import { getFinancialAnalytics } from "@/lib/data/analytics";
import { type AnalyticsRangeKey } from "@/lib/analytics/config";

function resolveRange(raw: string | null): AnalyticsRangeKey {
  if (raw === "30d" || raw === "60d" || raw === "90d" || raw === "120d" || raw === "1y" || raw === "3y" || raw === "5y") {
    return raw;
  }
  return "30d";
}

function resolveLimit(raw: string | null) {
  const parsed = Number(raw);
  if (parsed === 10 || parsed === 25 || parsed === 50 || parsed === 100) {
    return parsed;
  }
  return 10;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = resolveRange(url.searchParams.get("range"));
    const recentTransactionsLimit = resolveLimit(url.searchParams.get("limit"));
    const analytics = await getFinancialAnalytics(range, { recentTransactionsLimit });
    return NextResponse.json(analytics);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load financial analytics" },
      { status: 500 }
    );
  }
}
