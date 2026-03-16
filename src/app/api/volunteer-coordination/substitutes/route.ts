import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertSubstituteEntry } from "@/lib/volunteer-coordination/service";
import {
  errorResponse,
  parseJsonWithSchema,
  validationErrorResponse
} from "@/app/api/volunteer-coordination/_shared";
import { substituteUpsertSchema } from "@/lib/volunteer-coordination/validation";

export async function POST(request: Request) {
  try {
    const payload = await parseJsonWithSchema(request, substituteUpsertSchema);
    const result = await upsertSubstituteEntry(payload);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to save substitute entry.");
  }
}
