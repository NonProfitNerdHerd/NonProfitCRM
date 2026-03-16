import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertVolunteerConcern } from "@/lib/volunteer-coordination/service";
import {
  errorResponse,
  parseJsonWithSchema,
  validationErrorResponse
} from "@/app/api/volunteer-coordination/_shared";
import { concernUpsertSchema } from "@/lib/volunteer-coordination/validation";

export async function POST(request: Request) {
  try {
    const payload = await parseJsonWithSchema(request, concernUpsertSchema);
    const result = await upsertVolunteerConcern(payload);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to save volunteer concern.");
  }
}
