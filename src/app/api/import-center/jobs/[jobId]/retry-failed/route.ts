import { NextResponse } from "next/server";
import { requestRetryFailedRows } from "@/lib/import-center/import-jobs-service";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(_: Request, { params }: RouteContext) {
  try {
    const { jobId } = await params;
    const result = await requestRetryFailedRows(jobId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to retry failed rows." },
      { status: 500 }
    );
  }
}
