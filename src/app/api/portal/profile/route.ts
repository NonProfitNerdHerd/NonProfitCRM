import { NextResponse } from "next/server";
import { portalProfileSchema } from "@/lib/validation/portal-profile";
import { updatePortalProfile } from "@/lib/data/portal";
import { requireSessionContext } from "@/lib/auth/guards";
import { logAuditEvent } from "@/lib/data/audit";

export async function PATCH(request: Request) {
  try {
    const payload = await request.json();
    const parsed = portalProfileSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Validation error",
          issues: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    await updatePortalProfile({
      preferred_name: parsed.data.preferred_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      communication_preferences: {
        contact_by_email: parsed.data.contact_by_email,
        contact_by_sms: parsed.data.contact_by_sms
      }
    });

    const context = await requireSessionContext();
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "portal_profile_updated",
      targetEntityType: "contacts",
      metadata: {
        updated_fields: ["preferred_name", "email", "phone", "communication_preferences"]
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update profile" },
      { status: 500 }
    );
  }
}
