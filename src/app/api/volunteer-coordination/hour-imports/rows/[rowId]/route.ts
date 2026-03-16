import { NextResponse } from "next/server";
import { z } from "zod";
import { updateVolunteerHourImportRow } from "@/lib/volunteer-coordination/service";
import { errorResponse, validationErrorResponse } from "@/app/api/volunteer-coordination/_shared";
import { hourImportRowUpdateSchema } from "@/lib/volunteer-coordination/validation";

type RouteContext = {
  params: Promise<{ rowId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { rowId } = await params;
    const payload = await request.json();
    const parsed = hourImportRowUpdateSchema.safeParse({
      ...payload,
      rowId
    });
    if (!parsed.success) return validationErrorResponse(parsed.error);
    const result = await updateVolunteerHourImportRow({
      importRowId: parsed.data.rowId,
      matchedContactId: parsed.data.matchedContactId ?? null,
      matchedVolunteerProfileId: parsed.data.matchedVolunteerProfileId ?? null,
      stageStatus: parsed.data.stageStatus,
      errorMessage: parsed.data.errorMessage ?? null
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to update staged import row.");
  }
}
