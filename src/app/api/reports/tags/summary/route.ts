import { NextResponse } from "next/server";
import { getContactTagRollupSummary } from "@/lib/data/reports";

export async function GET() {
  try {
    const summary = await getContactTagRollupSummary();
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load tag rollup summary" },
      { status: 500 }
    );
  }
}

