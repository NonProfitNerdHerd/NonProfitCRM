import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureVolunteerTaxonomyTags,
  listVolunteerCoordinationTags
} from "@/lib/volunteer-coordination/service";
import { errorResponse, validationErrorResponse } from "@/app/api/volunteer-coordination/_shared";

const taxonomyEnsureSchema = z.object({
  rootName: z.string().trim().min(1),
  values: z.array(z.string().trim().min(1)).min(1)
});

export async function GET() {
  try {
    const tags = await listVolunteerCoordinationTags();
    return NextResponse.json({ tags });
  } catch (error) {
    return errorResponse(error, "Unable to load volunteer tags.");
  }
}

export async function POST(request: Request) {
  try {
    const payload = taxonomyEnsureSchema.parse(await request.json());
    const result = await ensureVolunteerTaxonomyTags(payload);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to create volunteer taxonomy tags.");
  }
}
