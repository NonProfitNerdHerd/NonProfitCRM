import { NextResponse } from "next/server";
import { resetAdminUserPassword } from "@/lib/data/admin-users";
import { apiErrorResponse } from "@/app/api/admin/users/_errors";

type RouteProps = {
  params: Promise<{ userId: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { userId } = await params;
    const result = await resetAdminUserPassword(userId);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to reset password");
  }
}
