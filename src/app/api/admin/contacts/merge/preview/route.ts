import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getContactMergePreview,
  isContactMergeSchemaMissingError
} from "@/lib/data/contact-merge";

const schema = z.object({
  masterContactId: z.string().uuid(),
  duplicateContactId: z.string().uuid()
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const result = await getContactMergePreview(parsed.data);
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
      { message: error instanceof Error ? error.message : "Unable to build merge preview" },
      { status: 500 }
    );
  }
}
