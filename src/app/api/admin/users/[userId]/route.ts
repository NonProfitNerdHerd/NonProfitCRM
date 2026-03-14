import { NextResponse } from "next/server";
import { z } from "zod";
import { updateAdminUser } from "@/lib/data/admin-users";

type RouteProps = {
  params: Promise<{ userId: string }>;
};

const updateUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  displayName: z.string().optional().default(""),
  email: z.string().email(),
  username: z.string().optional(),
  isActive: z.boolean(),
  roleTemplateIds: z.array(z.string().uuid()).min(1)
});

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { userId } = await params;
    const payload = await request.json();
    const parsed = updateUserSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await updateAdminUser({ ...parsed.data, userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update user" },
      { status: 500 }
    );
  }
}
