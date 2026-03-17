import { NextResponse } from "next/server";
import { z } from "zod";
import { createTask, listTasks, taskFilterOptions } from "@/lib/data/tasks";

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  suspenseDate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignedToUserId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  crmOrganizationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  parentTaskId: z.string().uuid().optional(),
  estimatedHours: z.coerce.number().nonnegative().optional(),
  actualHours: z.coerce.number().nonnegative().optional(),
  percentComplete: z.coerce.number().int().min(0).max(100).optional(),
  milestoneId: z.string().uuid().optional(),
  blockingNote: z.string().optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const [tasks, filters] = await Promise.all([
      listTasks({
        assignedTo: url.searchParams.get("assignedTo") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        projectId: url.searchParams.get("projectId") ?? undefined,
        contactId: url.searchParams.get("contactId") ?? undefined,
        dueFrom: url.searchParams.get("dueFrom") ?? undefined,
        dueTo: url.searchParams.get("dueTo") ?? undefined
      }),
      taskFilterOptions()
    ]);

    return NextResponse.json({ tasks, filters });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = createTaskSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const id = await createTask(parsed.data);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create task" },
      { status: 500 }
    );
  }
}
