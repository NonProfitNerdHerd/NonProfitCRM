import { NextResponse } from "next/server";
import { membershipTypeSchema } from "@/lib/validation/crm";
import { createMembershipType, listMembershipTypes } from "@/lib/data/memberships";

export async function GET() {
  try {
    const types = await listMembershipTypes();
    return NextResponse.json({ types });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load membership types" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = membershipTypeSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const id = await createMembershipType(parsed.data);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create membership type" },
      { status: 500 }
    );
  }
}
