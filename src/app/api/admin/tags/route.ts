import { NextResponse } from "next/server";
import { z } from "zod";
import { createTagDefinition, listTagDefinitions } from "@/lib/data/tags";

function flattenZodIssues(error: z.ZodError) {
  const flat = error.flatten();
  const fieldMessages = Object.entries(flat.fieldErrors)
    .flatMap(([field, messages]) =>
      (messages ?? []).map((message) => `${field}: ${message}`)
    )
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
        "This slug is already in use. Change the slug value and try again, or leave slug blank to auto-generate a unique one."
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
  return { status: 500, message: value?.message ?? "Unable to create tag" };
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(140).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  parentTagId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  isSystem: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  sortOrder: z.number().int().min(-100000).max(100000).optional(),
  externalKey: z.string().max(160).nullable().optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? "";
    const active = (url.searchParams.get("active") as "active" | "inactive" | "all" | null) ?? "active";
    const payload = await listTagDefinitions({ search, active });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load tags" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) {
      const issueList = flattenZodIssues(parsed.error);
      return NextResponse.json(
        { message: issueList.join(" ") || "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const created = await createTagDefinition(parsed.data);
    return NextResponse.json({ tag: created });
  } catch (error) {
    const friendly = toFriendlyTagError(error);
    return NextResponse.json(
      { message: friendly.message },
      { status: friendly.status }
    );
  }
}

