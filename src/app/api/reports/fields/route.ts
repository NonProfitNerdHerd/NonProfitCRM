import { NextResponse } from "next/server";
import { getReportBuilderMetadata } from "@/lib/data/reports";
import { type ReportType } from "@/lib/reports/config";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reportType = url.searchParams.get("reportType") as ReportType | null;

  try {
    const metadata = await getReportBuilderMetadata(reportType ?? undefined);
    return NextResponse.json(metadata);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load report metadata" },
      { status: 500 }
    );
  }
}
