import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertWaitlistEntry } from "@/lib/volunteer-coordination/service";
import {
  errorResponse,
  parseJsonWithSchema,
  validationErrorResponse
} from "@/app/api/volunteer-coordination/_shared";
import { waitlistUpsertSchema } from "@/lib/volunteer-coordination/validation";

export async function POST(request: Request) {
  try {
    const payload = await parseJsonWithSchema(request, waitlistUpsertSchema);
    const result = await upsertWaitlistEntry(payload);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to save waitlist entry.");
  }
}
