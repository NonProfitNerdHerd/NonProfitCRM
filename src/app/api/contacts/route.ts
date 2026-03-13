import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/validation/contact";
import { createContact } from "@/lib/data/contacts";
import { logAuditEvent } from "@/lib/data/audit";
import { requireSessionContext } from "@/lib/auth/guards";

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
