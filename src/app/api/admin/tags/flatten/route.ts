import { NextResponse } from "next/server";
import { z } from "zod";
import { flattenTagsForContacts } from "@/lib/data/tags";

const schema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(1000)
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
    const flattened = await flattenTagsForContacts(parsed.data.contactIds);
    return NextResponse.json({ flattened });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to flatten contact tags" },
      { status: 500 }
    );
  }
}

