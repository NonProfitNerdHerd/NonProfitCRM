import { NextResponse } from "next/server";
import { z } from "zod";
import { updateMembershipStatus } from "@/lib/data/memberships";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const schema = z.object({
  status: z.enum(["active", "inactive"])
});

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await updateMembershipStatus({ membershipId: id, status: parsed.data.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update membership status" },
      { status: 500 }
    );
  }
}
