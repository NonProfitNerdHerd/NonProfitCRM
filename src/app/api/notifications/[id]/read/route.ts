import { NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/data/notifications";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    await markNotificationRead(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to mark notification as read" },
      { status: 500 }
    );
  }
}
