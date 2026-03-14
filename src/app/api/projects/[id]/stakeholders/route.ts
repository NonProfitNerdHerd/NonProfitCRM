import { NextResponse } from "next/server";
import { projectStakeholderSchema } from "@/lib/validation/crm";
import { upsertProjectStakeholder } from "@/lib/data/projects";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const parsed = projectStakeholderSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const stakeholderId = await upsertProjectStakeholder(id, parsed.data);
    return NextResponse.json({ id: stakeholderId });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to save stakeholder entry"
      },
      { status: 500 }
    );
  }
}
