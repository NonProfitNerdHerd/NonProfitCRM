import { NextResponse } from "next/server";
import { getImportJobDetail } from "@/lib/import-center/import-jobs-service";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { jobId } = await params;
    const url = new URL(request.url);
    const detail = await getImportJobDetail({
      jobId,
      failedOffset: Number(url.searchParams.get("failedOffset") ?? "0"),
      failedLimit: Number(url.searchParams.get("failedLimit") ?? "50"),
      failedSearch: url.searchParams.get("failedSearch")
    });
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load import job." },
      { status: 500 }
    );
  }
}
