import { NextResponse } from "next/server";
import { getConstituentActivitiesReport } from "@/lib/data/reports";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const rows = await getConstituentActivitiesReport({
      filters: (payload?.filters ?? {}) as Record<string, unknown>
    });
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to build activities report" },
      { status: 500 }
    );
  }
}
