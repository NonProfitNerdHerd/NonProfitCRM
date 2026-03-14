import { NextResponse } from "next/server";
import { noteSchema } from "@/lib/validation/donation";
import { addNoteForContact } from "@/lib/data/contact-profile";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = noteSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const id = await addNoteForContact(parsed.data);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to add note" },
      { status: 500 }
    );
  }
}
