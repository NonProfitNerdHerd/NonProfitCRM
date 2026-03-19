import { NextResponse } from "next/server";
import { listRecentReportHistory } from "@/lib/data/reports";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const reportMode = url.searchParams.get("reportMode");
    const outputType = url.searchParams.get("outputType");
    const rows = await listRecentReportHistory({
      reportMode:
        reportMode === "constituent" || reportMode === "transaction" || reportMode === "project"
          ? reportMode
          : "",
      outputType:
        outputType === "csv" || outputType === "excel" || outputType === "pdf" ? outputType : ""
    });
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load report history." },
      { status: 500 }
    );
  }
}
