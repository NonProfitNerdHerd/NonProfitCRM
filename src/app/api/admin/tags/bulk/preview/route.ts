import { NextResponse } from "next/server";
import { z } from "zod";
import { previewBulkTagAssignment } from "@/lib/data/tags";

const schema = z.object({
  jobType: z.enum(["add", "remove"]),
  tagIds: z.array(z.string().uuid()).min(1).max(100),
  sourceFilterDefinition: z.object({
    mode: z
      .enum(["all", "donors", "contacts", "donor_organizations", "organizations", "personal"])
      .optional(),
    q: z.string().optional(),
    tagFilter: z
      .object({
        tagIds: z.array(z.string().uuid()).min(1),
        match: z.enum(["any", "all", "none"]),
        includeDescendants: z.boolean().optional()
      })
      .optional()
  })
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const preview = await previewBulkTagAssignment(parsed.data);
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to preview bulk tag job" },
      { status: 500 }
    );
  }
}

