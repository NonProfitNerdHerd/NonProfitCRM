import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminUser, listAdminUsersData } from "@/lib/data/admin-users";
import { apiErrorResponse } from "@/app/api/admin/users/_errors";

const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  displayName: z.string().optional().default(""),
  email: z.string().email(),
  username: z.string().optional(),
  isActive: z.boolean().default(true),
  roleTemplateIds: z.array(z.string().uuid()).min(1),
});

export async function GET() {
  try {
    const data = await listAdminUsersData();
    return NextResponse.json(data);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load users");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = createUserSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await createAdminUser(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to create user");
  }
}
