import { NextResponse } from "next/server";
import { rollbackImportBatch } from "@/lib/data/import-engine";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await rollbackImportBatch(payload.jobId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to rollback import batch" },
      { status: 500 }
    );
  }
}
