import { NextResponse } from "next/server";
import { projectStakeholderSchema } from "@/lib/validation/crm";
import { removeProjectStakeholder, upsertProjectStakeholder } from "@/lib/data/projects";

type RouteProps = {
  params: Promise<{ id: string; stakeholderId: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id, stakeholderId } = await params;
    const payload = await request.json();
    const parsed = projectStakeholderSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updatedId = await upsertProjectStakeholder(id, {
      id: stakeholderId,
      ...parsed.data
    });
    return NextResponse.json({ id: updatedId });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to update stakeholder entry"
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { id, stakeholderId } = await params;
    await removeProjectStakeholder(id, stakeholderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete stakeholder" },
      { status: 500 }
    );
  }
}
