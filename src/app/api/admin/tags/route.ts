import { NextResponse } from "next/server";
import { z } from "zod";
import { createTagDefinition, listTagDefinitions } from "@/lib/data/tags";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().max(140).optional(),
  description: z.string().max(2000).optional(),
  parentTagId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  isSystem: z.boolean().optional(),
  color: z.string().max(32).optional(),
  sortOrder: z.number().int().min(-100000).max(100000).optional(),
  externalKey: z.string().max(160).optional()
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
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const created = await createTagDefinition(parsed.data);
    return NextResponse.json({ tag: created });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create tag" },
      { status: 500 }
    );
  }
}

