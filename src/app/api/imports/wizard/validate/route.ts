import { NextResponse } from "next/server";
import { validateImportBatch } from "@/lib/data/import-engine";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await validateImportBatch({
      jobId: payload.jobId,
      matchBy: payload.matchBy ?? undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to validate import batch" },
      { status: 500 }
    );
  }
}
