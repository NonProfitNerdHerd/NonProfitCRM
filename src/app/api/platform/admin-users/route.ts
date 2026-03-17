import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createPlatformAdminUser,
  listPlatformAdminUsersData,
  toPlatformError
} from "@/lib/data/platform-admin";

const createPlatformUserSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  displayName: z.string().trim().optional(),
  email: z.string().trim().email(),
  username: z.string().trim().optional(),
  isActive: z.boolean().default(true),
  roleKeys: z.array(z.string().trim()).min(1)
});

export async function GET() {
  try {
    const data = await listPlatformAdminUsersData();
    return NextResponse.json(data);
  } catch (error) {
    const normalized = toPlatformError(error, "Unable to load platform users.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = createPlatformUserSchema.parse(await request.json());
    const result = await createPlatformAdminUser(payload);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation failed.", issues: error.flatten() },
        { status: 400 }
      );
    }
    const normalized = toPlatformError(error, "Unable to create platform user.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}
