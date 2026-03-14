import { NextResponse } from "next/server";
import { setDuplicateDecision } from "@/lib/data/import-engine";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    await setDuplicateDecision({
      jobId: payload.jobId,
      stagingRowId: payload.stagingRowId,
      decision: payload.decision,
      targetEntityId: payload.targetEntityId ?? undefined,
      reason: payload.reason ?? undefined,
      mergePayload: payload.mergePayload ?? undefined
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to apply duplicate decision" },
      { status: 500 }
    );
  }
}
