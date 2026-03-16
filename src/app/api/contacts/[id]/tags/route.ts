import { NextResponse } from "next/server";
import { z } from "zod";
import { assignTagsToContact, listContactTags, removeTagsFromContact } from "@/lib/data/tags";
import { hasAnyStaffPermission, requireSessionContext } from "@/lib/auth/guards";

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
    const canAssign = await hasAnyStaffPermission(
      ["can_assign_contact_tags", "can_manage_contact_tags"],
      context
    );
    const tags = await listContactTags(id);
    return NextResponse.json({ tags, canAssign });
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

