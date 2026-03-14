import { NextResponse } from "next/server";
import { addTaskComment } from "@/lib/data/tasks";
import { taskCommentSchema } from "@/lib/validation/crm";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const parsed = taskCommentSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await addTaskComment({ taskId: id, commentBody: parsed.data.commentBody });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to add comment" },
      { status: 500 }
    );
  }
}
