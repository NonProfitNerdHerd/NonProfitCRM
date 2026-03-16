import { NextResponse } from "next/server";
import { z } from "zod";
import { stageVolunteerHourImport } from "@/lib/volunteer-coordination/service";
import {
  errorResponse,
  parseJsonWithSchema,
  validationErrorResponse
} from "@/app/api/volunteer-coordination/_shared";
import { hourImportStageSchema } from "@/lib/volunteer-coordination/validation";

export async function POST(request: Request) {
  try {
    const payload = await parseJsonWithSchema(request, hourImportStageSchema);
    const result = await stageVolunteerHourImport({
      eventId: payload.eventId,
      sourceFilename: payload.sourceFilename,
      columnMapping: payload.columnMapping,
      rows: payload.rows
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to stage volunteer hour import.");
  }
}
