import { NextResponse } from "next/server";
import { z } from "zod";
import { hardDeleteTagDefinition, updateTagDefinition } from "@/lib/data/tags";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().max(140).optional(),
  description: z.string().max(2000).nullable().optional(),
  parentTagId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  sortOrder: z.number().int().min(-100000).max(100000).optional(),
  externalKey: z.string().max(160).nullable().optional()
});

type RouteProps = {
  params: Promise<{ tagId: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { tagId } = await params;
    const payload = await request.json();
    const parsed = updateSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tag = await updateTagDefinition(tagId, parsed.data);
    return NextResponse.json({ tag });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update tag" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { tagId } = await params;
    await hardDeleteTagDefinition(tagId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete tag" },
      { status: 500 }
    );
  }
}

