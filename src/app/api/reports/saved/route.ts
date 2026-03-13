import { NextResponse } from "next/server";
import { listSavedReports, saveReportDefinition, type ReportDomain } from "@/lib/data/reports";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const domain = url.searchParams.get("domain") as ReportDomain | null;
    const reports = await listSavedReports(domain ?? undefined);
    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load reports" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const id = await saveReportDefinition({
      id: payload.id,
      name: payload.name,
      description: payload.description,
      domain: payload.domain,
      selectedFieldKeys: payload.selectedFieldKeys,
      filters: payload.filters,
      sort: payload.sort
    });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to save report" },
      { status: 500 }
    );
  }
}
