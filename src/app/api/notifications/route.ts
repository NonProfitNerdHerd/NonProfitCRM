import { NextResponse } from "next/server";
import { listMyNotifications, markAllNotificationsRead } from "@/lib/data/notifications";

export async function GET() {
  try {
    const notifications = await listMyNotifications();
    return NextResponse.json({ notifications });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    if (payload?.action === "mark_all_read") {
      await markAllNotificationsRead();
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ message: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update notifications" },
      { status: 500 }
    );
  }
}
