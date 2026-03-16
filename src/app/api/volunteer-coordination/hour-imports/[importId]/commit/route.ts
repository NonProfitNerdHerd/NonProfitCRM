import { NextResponse } from "next/server";
import { z } from "zod";
import { commitVolunteerHourImport } from "@/lib/volunteer-coordination/service";
import { errorResponse, validationErrorResponse } from "@/app/api/volunteer-coordination/_shared";
import { hourImportCommitSchema } from "@/lib/volunteer-coordination/validation";

type RouteContext = {
  params: Promise<{ importId: string }>;
};

export async function POST(_: Request, { params }: RouteContext) {
  try {
    const { importId } = await params;
    const parsed = hourImportCommitSchema.safeParse({ importId });
    if (!parsed.success) return validationErrorResponse(parsed.error);
    const result = await commitVolunteerHourImport({
      importId: parsed.data.importId
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to commit volunteer hour import.");
  }
}
