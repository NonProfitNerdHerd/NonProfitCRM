import { NextResponse } from "next/server";
import { runReport } from "@/lib/data/reports";
import { type ReportType } from "@/lib/reports/config";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await runReport({
      reportType: payload.reportType as ReportType,
      selectedColumns: (payload.selectedColumns ?? []) as string[],
      filters: payload.filters,
      sort: payload.sort,
      page: payload.page,
      pageSize: payload.pageSize,
      exportAll: Boolean(payload.exportAll),
      recordRun: payload.recordRun
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Report execution failed" },
      { status: 500 }
    );
  }
}
