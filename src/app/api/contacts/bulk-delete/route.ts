import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/audit";
import { requireStaffPermission } from "@/lib/auth/guards";

const schema = z.object({
  confirmation: z.literal("DELETE"),
  ids: z.array(z.string().uuid()).min(1).max(500)
});

export async function POST(request: Request) {
  try {
    const context = await requireStaffPermission("can_mass_delete_records");
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("organization_id", context.organizationId)
      .in("id", parsed.data.ids);
    if (error) throw error;

    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "mass_delete_contacts",
      targetEntityType: "contacts",
      targetEntityId: null,
      metadata: { count: parsed.data.ids.length, ids: parsed.data.ids }
    });

    return NextResponse.json({ ok: true, deletedCount: parsed.data.ids.length });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to mass delete contacts" },
      { status: 500 }
    );
  }
}
