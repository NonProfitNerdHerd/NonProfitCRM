import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getVolunteerProfileForContact,
  upsertVolunteerProfile
} from "@/lib/volunteer-coordination/service";
import {
  errorResponse,
  parseJsonWithSchema,
  validationErrorResponse
} from "@/app/api/volunteer-coordination/_shared";
import { volunteerProfileUpsertSchema } from "@/lib/volunteer-coordination/validation";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const contactId = String(url.searchParams.get("contactId") ?? "").trim();
    if (!contactId) {
      return NextResponse.json({ message: "contactId is required." }, { status: 400 });
    }
    const result = await getVolunteerProfileForContact(contactId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to load volunteer profile.");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await parseJsonWithSchema(request, volunteerProfileUpsertSchema);
    const result = await upsertVolunteerProfile(payload);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return validationErrorResponse(error);
    return errorResponse(error, "Unable to save volunteer profile.");
  }
}
