import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createTagDefinition } from "@/lib/data/tags";
import { requireStaffPermission } from "@/lib/auth/guards";

const ensureSchema = z.object({
  name: z.string().min(1).max(120),
  parentTagId: z.string().uuid().nullable().optional(),
  module: z.string().max(64).nullable().optional()
});

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isDuplicateError(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = normalizeText(candidate?.message).toLowerCase();
  const details = normalizeText(candidate?.details).toLowerCase();
  return candidate?.code === "23505" || message.includes("duplicate key") || details.includes("duplicate key");
}

export async function POST(request: Request) {
  try {
    const parsed = ensureSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Tag name is required.", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const context = await requireStaffPermission("can_manage_contact_tags");
    const supabase = await createClient();
    const normalizedName = normalizeText(parsed.data.name);
    const parentTagId = normalizeText(parsed.data.parentTagId) || null;
    const moduleKey = normalizeText(parsed.data.module) || "contacts";

    const existingQuery = supabase
      .from("tags")
      .select("id,name,slug,path,level,color,is_active,parent_tag_id,module")
      .eq("organization_id", context.organizationId)
      .eq("module", moduleKey)
      .ilike("name", normalizedName)
      .order("level", { ascending: true })
      .limit(1);
    const { data: existingRows, error: existingError } = parentTagId
      ? await existingQuery.eq("parent_tag_id", parentTagId)
      : await existingQuery;
    if (existingError) throw existingError;

    const existing = existingRows?.[0];
    if (existing) {
      return NextResponse.json({ tag: existing, created: false });
    }

    try {
      const tag = await createTagDefinition({
        name: normalizedName,
        parentTagId: parentTagId || null,
        module: moduleKey
      });
      return NextResponse.json({ tag, created: true });
    } catch (error) {
      if (!isDuplicateError(error)) throw error;

      const retryQuery = supabase
        .from("tags")
        .select("id,name,slug,path,level,color,is_active,parent_tag_id,module")
        .eq("organization_id", context.organizationId)
        .eq("module", moduleKey)
        .ilike("name", normalizedName)
        .order("level", { ascending: true })
        .limit(1);
      const { data: retryRows, error: retryError } = parentTagId
        ? await retryQuery.eq("parent_tag_id", parentTagId)
        : await retryQuery;
      if (retryError) throw retryError;
      if (retryRows?.[0]) {
        return NextResponse.json({ tag: retryRows[0], created: false });
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to ensure tag."
      },
      { status: 500 }
    );
  }
}
