import { NextResponse } from "next/server";
import { listSavedReports, saveReportDefinition } from "@/lib/data/reports";
import { type ReportType } from "@/lib/reports/config";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const reportType = url.searchParams.get("reportType") as ReportType | null;
    const reports = await listSavedReports(reportType ?? undefined);
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
      saveAsNew: Boolean(payload.saveAsNew),
      name: payload.name,
      description: payload.description,
      reportType: payload.reportType,
      selectedColumns: payload.selectedColumns ?? [],
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
