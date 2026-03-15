import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/validation/contact";
import { createContact } from "@/lib/data/contacts";
import { logAuditEvent } from "@/lib/data/audit";
import { requireSessionContext, requireStaffPermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const context = await requireStaffPermission("can_view_contacts");
    const supabase = await createClient();
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 100);

    let query = supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, preferred_name, email, phone, organization_name, entity_type, tracking_status, city, state"
      )
      .eq("organization_id", context.organizationId)
      .order("last_name", { ascending: true })
      .limit(limit);
    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `first_name.ilike.${like},last_name.ilike.${like},preferred_name.ilike.${like},email.ilike.${like},phone.ilike.${like},organization_name.ilike.${like},city.ilike.${like},state.ilike.${like}`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ contacts: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to load contacts"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = contactSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Validation error",
          issues: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    const context = await requireSessionContext();
    const id = await createContact(parsed.data);
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "contact_created",
      targetEntityType: "contacts",
      targetEntityId: id,
      metadata: { contains_pii: true }
    });

    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to create contact"
      },
      { status: 500 }
    );
  }
}
