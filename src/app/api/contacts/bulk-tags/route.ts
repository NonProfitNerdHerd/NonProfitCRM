import { NextResponse } from "next/server";
import { z } from "zod";
import { bulkAssignTagsToContacts } from "@/lib/data/tags";

const schema = z.object({
  action: z.enum(["add", "remove"]),
  contactIds: z.array(z.string().uuid()).min(1).max(500),
  tagIds: z.array(z.string().uuid()).min(1).max(100)
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

    const result = await bulkAssignTagsToContacts(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to process bulk contact tag operation"
      },
      { status: 500 }
    );
  }
}

