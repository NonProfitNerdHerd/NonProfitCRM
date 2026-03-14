import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject } from "@/lib/data/projects";
import { requireSessionContext } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "on_hold", "completed", "cancelled"]).optional(),
  projectStartDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
  projectManagerUserId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional()
});

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const result = await getProject(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load project" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const parsed = updateProjectSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const context = await requireSessionContext();
    const supabase = await createClient();

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined)
      updates.description = parsed.data.description ?? null;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.projectStartDate !== undefined)
      updates.project_start_date = parsed.data.projectStartDate || null;
    if (parsed.data.expectedEndDate !== undefined)
      updates.expected_end_date = parsed.data.expectedEndDate || null;
    if (parsed.data.projectManagerUserId !== undefined)
      updates.project_manager_user_id = parsed.data.projectManagerUserId;
    if (parsed.data.ownerUserId !== undefined) updates.owner_user_id = parsed.data.ownerUserId;

    const { error } = await supabase
      .from("projects")
      .update(updates)
      .eq("organization_id", context.organizationId)
      .eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update project" },
      { status: 500 }
    );
  }
}
