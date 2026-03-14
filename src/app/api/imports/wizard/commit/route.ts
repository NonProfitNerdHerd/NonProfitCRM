import { NextResponse } from "next/server";
import { commitImportBatch } from "@/lib/data/import-engine";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await commitImportBatch({
      jobId: payload.jobId,
      mode: payload.mode ?? "upsert",
      matchBy: payload.matchBy ?? undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to commit import batch" },
      { status: 500 }
    );
  }
}
