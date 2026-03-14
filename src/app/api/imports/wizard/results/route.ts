import { NextResponse } from "next/server";
import { getImportBatchResults } from "@/lib/data/import-engine";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ message: "jobId is required" }, { status: 400 });
    }
    const result = await getImportBatchResults(jobId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load import results" },
      { status: 500 }
    );
  }
}
