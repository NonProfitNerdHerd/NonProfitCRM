import { NextResponse } from "next/server";
import { z } from "zod";
import { runVolunteerSeriesGenerationJob } from "@/lib/volunteer-coordination/service";
import {
  errorResponse,
  parseJsonWithSchema,
  validationErrorResponse
} from "@/app/api/volunteer-coordination/_shared";

const runRecurrenceSchema = z.object({
  throughDate: z.string().trim().optional().nullable(),
  maxOccurrencesPerSeries: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  limitSeries: z.coerce.number().int().min(1).max(200).optional().nullable()
});

export async function POST(request: Request) {
  try {
    const payload = await parseJsonWithSchema(request, runRecurrenceSchema);
    const result = await runVolunteerSeriesGenerationJob({
      throughDate: payload.throughDate ?? null,
      maxOccurrencesPerSeries: payload.maxOccurrencesPerSeries ?? null,
      limitSeries: payload.limitSeries ?? null
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to run recurrence generation job.");
  }
}
