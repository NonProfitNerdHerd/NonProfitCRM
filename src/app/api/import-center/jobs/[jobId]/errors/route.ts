import { NextResponse } from "next/server";
import { buildFailureReportCsv } from "@/lib/import-center/import-jobs-service";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_: Request, { params }: RouteContext) {
  try {
    const { jobId } = await params;
    const csv = await buildFailureReportCsv(jobId);

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="import-failure-report-${jobId}.csv"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to export error log." },
      { status: 500 }
    );
  }
}
