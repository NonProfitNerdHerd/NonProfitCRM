import { NextResponse } from "next/server";
import { listMyCallSheetTasks } from "@/lib/data/tasks";

export async function GET() {
  try {
    const tasks = await listMyCallSheetTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to build call sheet" },
      { status: 500 }
    );
  }
}
