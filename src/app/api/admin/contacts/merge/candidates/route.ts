import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getDuplicateCandidates,
  getSuggestedDuplicateGroups,
  isContactMergeSchemaMissingError
} from "@/lib/data/contact-merge";

const querySchema = z.object({
  mode: z.enum(["suggested", "by_contact", "search"]).optional(),
  contactId: z.string().uuid().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(300).optional()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      mode: searchParams.get("mode") ?? undefined,
      contactId: searchParams.get("contactId") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      limit: searchParams.get("limit") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const mode = parsed.data.mode ?? "suggested";
    if (mode === "suggested" && !parsed.data.contactId && !parsed.data.q) {
      const result = await getSuggestedDuplicateGroups({
        limitGroups: parsed.data.limit
      });
      return NextResponse.json(result);
    }

    if (mode === "search" && !parsed.data.q) {
      return NextResponse.json({ message: "Provide q parameter for search mode." }, { status: 400 });
    }
    if (mode === "by_contact" && !parsed.data.contactId) {
      return NextResponse.json(
        { message: "Provide contactId parameter for by_contact mode." },
        { status: 400 }
      );
    }

    const result = await getDuplicateCandidates(parsed.data);
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
      { message: error instanceof Error ? error.message : "Unable to load duplicate candidates" },
      { status: 500 }
    );
  }
}
