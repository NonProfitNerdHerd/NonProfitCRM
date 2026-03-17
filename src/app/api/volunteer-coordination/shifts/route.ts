import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertVolunteerRoleShift } from "@/lib/volunteer-coordination/service";
import {
  errorResponse,
  parseJsonWithSchema,
  validationErrorResponse
} from "@/app/api/volunteer-coordination/_shared";
import { volunteerRoleShiftUpsertSchema } from "@/lib/volunteer-coordination/validation";

export async function POST(request: Request) {
  try {
    const payload = await parseJsonWithSchema(request, volunteerRoleShiftUpsertSchema);
    const result = await upsertVolunteerRoleShift(payload);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to save volunteer role shift.");
  }
}
