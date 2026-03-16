import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteTagSyncMapping,
  listTagSyncMappings,
  upsertTagSyncMapping
} from "@/lib/data/tags";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  internalTagId: z.string().uuid(),
  externalSystem: z.string().min(1).max(120),
  externalTagIdentifier: z.string().min(1).max(250),
  syncDirection: z.enum(["inbound", "outbound", "bidirectional"]),
  isActive: z.boolean().optional(),
  mappingStatus: z.enum(["mapped", "pending", "error"]).optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const externalSystem = url.searchParams.get("externalSystem") ?? undefined;
    const internalTagId = url.searchParams.get("internalTagId") ?? undefined;
    const mappings = await listTagSyncMappings({ externalSystem, internalTagId });
    return NextResponse.json({ mappings });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load tag sync mappings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = upsertSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const mapping = await upsertTagSyncMapping(parsed.data);
    return NextResponse.json({ mapping });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to save tag sync mapping" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json();
    const parsed = z
      .object({
        id: z.string().uuid()
      })
      .safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    await deleteTagSyncMapping(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete tag sync mapping" },
      { status: 500 }
    );
  }
}

