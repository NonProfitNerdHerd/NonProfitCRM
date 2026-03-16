import { NextResponse } from "next/server";
import { z } from "zod";
import { assignTagsToContact, listContactTags, removeTagsFromContact } from "@/lib/data/tags";
import { requireSessionContext } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const mutationSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1).max(100),
  notes: z.string().max(2000).optional(),
  assignmentSource: z
    .enum(["manual", "bulk", "donation_rule", "api", "import", "integration"])
    .optional()
});

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const context = await requireSessionContext();
    const supabase = await createClient();
    const [{ data: canAssignData }, { data: canManageData }] = await Promise.all([
      supabase.rpc("has_permission", {
        org_id: context.organizationId,
        permission_key: "can_assign_contact_tags"
      }),
      supabase.rpc("has_permission", {
        org_id: context.organizationId,
        permission_key: "can_manage_contact_tags"
      })
    ]);
    const tags = await listContactTags(id);
    return NextResponse.json({ tags, canAssign: Boolean(canAssignData) || Boolean(canManageData) });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load contact tags" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const parsed = mutationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tags = await assignTagsToContact({
      contactId: id,
      tagIds: parsed.data.tagIds,
      notes: parsed.data.notes,
      assignmentSource: parsed.data.assignmentSource ?? "manual",
      actionSource: "contact_profile"
    });
    return NextResponse.json({ tags });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to assign tags to contact" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await request.json();
    const parsed = z
      .object({
        tagIds: z.array(z.string().uuid()).min(1).max(100)
      })
      .safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tags = await removeTagsFromContact({
      contactId: id,
      tagIds: parsed.data.tagIds,
      actionSource: "contact_profile"
    });
    return NextResponse.json({ tags });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to remove tags from contact" },
      { status: 500 }
    );
  }
}

