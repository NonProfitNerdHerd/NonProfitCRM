import { NextResponse } from "next/server";
import { z } from "zod";
import { hardDeleteTagDefinition, updateTagDefinition } from "@/lib/data/tags";

function flattenZodIssues(error: z.ZodError) {
  const flat = error.flatten();
  const fieldMessages = Object.entries(flat.fieldErrors)
    .flatMap(([field, messages]) => {
      const list = Array.isArray(messages) ? messages : [];
      return list.map((message) => `${field}: ${message}`);
    })
    .filter(Boolean);
  const formMessages = flat.formErrors ?? [];
  return [...fieldMessages, ...formMessages];
}

function toFriendlyTagError(error: unknown) {
  const value = error as { message?: string; details?: string; hint?: string; code?: string };
  const message = String(value?.message ?? "").toLowerCase();
  const details = String(value?.details ?? "").toLowerCase();
  if (
    message.includes("tag slug already exists") ||
    message.includes("duplicate key") ||
    details.includes("idx_tags_unique_slug")
  ) {
    return {
      status: 400,
      message:
        "This slug is already in use. Change the slug value and try again, or leave slug unchanged."
    };
  }
  if (message.includes("parent tag was not found")) {
    return { status: 400, message: "The selected parent tag was not found." };
  }
  if (message.includes("circular tag hierarchy")) {
    return { status: 400, message: "That parent selection would create a circular tag hierarchy." };
  }
  if (message.includes("maximum hierarchy depth") || message.includes("depth cannot exceed")) {
    return { status: 400, message: "Tag hierarchy depth cannot exceed 4 levels." };
  }
  return { status: 500, message: value?.message ?? "Unable to update tag" };
}

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().max(140).nullable().optional(),
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
      const issueList = flattenZodIssues(parsed.error);
      return NextResponse.json(
        { message: issueList.join(" ") || "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tag = await updateTagDefinition(tagId, parsed.data);
    return NextResponse.json({ tag });
  } catch (error) {
    const friendly = toFriendlyTagError(error);
    return NextResponse.json(
      { message: friendly.message },
      { status: friendly.status }
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

