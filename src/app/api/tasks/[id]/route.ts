import { NextResponse } from "next/server";
import { z } from "zod";
import { updateTaskStatus } from "@/lib/data/tasks";

const updateTaskSchema = z.object({
  status: z.enum(["todo", "in_progress", "completed", "blocked", "cancelled"])
});

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const parsed = updateTaskSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await updateTaskStatus({ taskId: id, status: parsed.data.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update task" },
      { status: 500 }
    );
  }
}
