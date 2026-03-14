import { NextResponse } from "next/server";
import { getFinancialAnalytics } from "@/lib/data/analytics";
import { type AnalyticsRangeKey } from "@/lib/analytics/config";

function resolveRange(raw: string | null): AnalyticsRangeKey {
  if (raw === "30d" || raw === "60d" || raw === "90d" || raw === "120d" || raw === "1y" || raw === "3y" || raw === "5y") {
    return raw;
  }
  return "30d";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = resolveRange(url.searchParams.get("range"));
    const analytics = await getFinancialAnalytics(range);
    return NextResponse.json(analytics);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load financial analytics" },
      { status: 500 }
    );
  }
}
