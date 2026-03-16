import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getContactMergeHistory,
  isContactMergeSchemaMissingError
} from "@/lib/data/contact-merge";

const querySchema = z.object({
  contactId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      contactId: searchParams.get("contactId") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const result = await getContactMergeHistory(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (isContactMergeSchemaMissingError(error)) {
      return NextResponse.json(
        {
          message:
            "Contact merge schema is not available in this environment yet. Run Supabase migration 202603171300 and retry."
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load merge history" },
      { status: 500 }
    );
  }
}
