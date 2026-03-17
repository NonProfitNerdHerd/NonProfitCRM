import { NextResponse } from "next/server";
import { z } from "zod";
import { toPlatformError, updatePlatformAdminUser } from "@/lib/data/platform-admin";

const updatePlatformUserSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  displayName: z.string().trim().optional(),
  email: z.string().trim().email(),
  username: z.string().trim().optional(),
  isActive: z.boolean().default(true),
  roleKeys: z.array(z.string().trim()).min(1)
});

type RouteParams = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await params;
    const payload = updatePlatformUserSchema.parse(await request.json());
    await updatePlatformAdminUser({
      userId,
      ...payload
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation failed.", issues: error.flatten() },
        { status: 400 }
      );
    }
    const normalized = toPlatformError(error, "Unable to update platform user.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}
