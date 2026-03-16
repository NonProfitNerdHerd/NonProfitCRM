import { NextResponse } from "next/server";
import { z } from "zod";
import { generateVolunteerEventInstances } from "@/lib/volunteer-coordination/service";
import {
  errorResponse,
  parseJsonWithSchema,
  validationErrorResponse
} from "@/app/api/volunteer-coordination/_shared";
import { eventSeriesGenerateSchema } from "@/lib/volunteer-coordination/validation";

type RouteContext = {
  params: Promise<{ seriesId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { seriesId } = await params;
    const payload = await parseJsonWithSchema(request, eventSeriesGenerateSchema);
    const result = await generateVolunteerEventInstances({
      seriesId,
      throughDate: payload.throughDate ?? null,
      maxOccurrences: payload.maxOccurrences ?? null
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to generate recurring event instances.");
  }
}
