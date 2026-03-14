import { NextResponse } from "next/server";
import { resetAdminUserPassword } from "@/lib/data/admin-users";

type RouteProps = {
  params: Promise<{ userId: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { userId } = await params;
    const result = await resetAdminUserPassword(userId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to reset password" },
      { status: 500 }
    );
  }
}
