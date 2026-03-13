import { NextResponse } from "next/server";
import { runReport } from "@/lib/data/reports";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await runReport({
      domain: payload.domain,
      selectedFieldKeys: payload.selectedFieldKeys,
      filters: payload.filters,
      sort: payload.sort
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Report execution failed" },
      { status: 500 }
    );
  }
}
