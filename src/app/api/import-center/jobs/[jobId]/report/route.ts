import { NextResponse } from "next/server";
import { buildJobSummaryCsv } from "@/lib/import-center/import-jobs-service";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_: Request, { params }: RouteContext) {
  try {
    const { jobId } = await params;
    const csv = await buildJobSummaryCsv(jobId);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="import-job-summary-${jobId}.csv"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to build job summary report." },
      { status: 500 }
    );
  }
}
