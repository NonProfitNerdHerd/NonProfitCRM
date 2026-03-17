import { NextResponse } from "next/server";
import { getTask, updateTask } from "@/lib/data/tasks";
import { taskUpdateSchema } from "@/lib/validation/crm";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const data = await getTask(id);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load task" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const parsed = taskUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await updateTask({
      taskId: id,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      priority: parsed.data.priority,
      suspenseDate: parsed.data.suspenseDate,
      assignedToUserId: parsed.data.assignedToUserId,
      ownerUserId: parsed.data.ownerUserId,
      estimatedHours: parsed.data.estimatedHours,
      actualHours: parsed.data.actualHours,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      percentComplete: parsed.data.percentComplete,
      milestoneId: parsed.data.milestoneId,
      blockingNote: parsed.data.blockingNote
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update task" },
      { status: 500 }
    );
  }
}
