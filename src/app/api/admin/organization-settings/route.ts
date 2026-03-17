import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffPermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const updateOrganizationSettingsSchema = z.object({
  organizationName: z.string().trim().min(1).max(200),
  primaryContactName: z.string().trim().max(200).optional().nullable(),
  primaryContactEmail: z.string().trim().max(200).optional().nullable(),
  primaryContactPhone: z.string().trim().max(100).optional().nullable(),
  logoDataUrl: z.string().trim().max(2_000_000).optional().nullable()
});

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export async function GET() {
  try {
    const context = await requireStaffPermission("can_manage_org_settings");
    const supabase = await createClient();
    const [{ data: organization, error: organizationError }, { data: tenant, error: tenantError }] =
      await Promise.all([
        supabase
          .from("organizations")
          .select(
            "id,name,slug,logo_url,primary_contact_name,primary_contact_email,primary_contact_phone,created_at,updated_at"
          )
          .eq("id", context.organizationId)
          .maybeSingle(),
        supabase
          .from("tenants")
          .select("primary_contact_name,primary_contact_email,primary_contact_phone")
          .eq("id", context.organizationId)
          .maybeSingle()
      ]);
    if (organizationError) {
      return NextResponse.json({ message: organizationError.message }, { status: 500 });
    }
    if (tenantError) {
      return NextResponse.json({ message: tenantError.message }, { status: 500 });
    }
    return NextResponse.json({
      organization: {
        ...organization,
        primary_contact_name:
          organization?.primary_contact_name ?? tenant?.primary_contact_name ?? null,
        primary_contact_email:
          organization?.primary_contact_email ?? tenant?.primary_contact_email ?? null,
        primary_contact_phone:
          organization?.primary_contact_phone ?? tenant?.primary_contact_phone ?? null
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load organization settings." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireStaffPermission("can_manage_org_settings");
    const payload = updateOrganizationSettingsSchema.parse(await request.json());
    const logoDataUrl = normalizeOptionalText(payload.logoDataUrl);
    if (logoDataUrl && !logoDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { message: "Logo upload must be an image file." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const updatePayload = {
      name: payload.organizationName.trim(),
      logo_url: logoDataUrl,
      primary_contact_name: normalizeOptionalText(payload.primaryContactName),
      primary_contact_email: normalizeOptionalText(payload.primaryContactEmail),
      primary_contact_phone: normalizeOptionalText(payload.primaryContactPhone)
    };
    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .update(updatePayload)
      .eq("id", context.organizationId)
      .select(
        "id,name,slug,logo_url,primary_contact_name,primary_contact_email,primary_contact_phone,created_at,updated_at"
      )
      .single();
    if (organizationError) {
      return NextResponse.json({ message: organizationError.message }, { status: 500 });
    }

    const { error: tenantError } = await supabase
      .from("tenants")
      .update({
        organization_name: payload.organizationName.trim(),
        primary_contact_name: normalizeOptionalText(payload.primaryContactName),
        primary_contact_email: normalizeOptionalText(payload.primaryContactEmail),
        primary_contact_phone: normalizeOptionalText(payload.primaryContactPhone)
      })
      .eq("id", context.organizationId);
    if (tenantError) {
      return NextResponse.json({ message: tenantError.message }, { status: 500 });
    }

    return NextResponse.json({ organization });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation failed.", issues: error.flatten() },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update organization settings." },
      { status: 500 }
    );
  }
}
