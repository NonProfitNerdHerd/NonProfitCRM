import { NextResponse } from "next/server";
import { z } from "zod";
import { createTenantProvisioning, listTenants, toPlatformError } from "@/lib/data/platform-admin";

const createTenantSchema = z.object({
  organizationName: z.string().trim().min(2),
  slug: z.string().trim().min(2),
  primaryContactName: z.string().trim().optional(),
  primaryContactEmail: z.string().trim().email().optional().or(z.literal("")),
  primaryContactPhone: z.string().trim().optional(),
  planPackage: z.string().trim().optional(),
  enabledModulesCsv: z.string().trim().optional(),
  onboardingStage: z.string().trim().optional(),
  backupTierId: z.string().trim().optional(),
  firstTenantAdminEmail: z.string().trim().optional(),
  firstTenantAdminUserId: z.string().trim().uuid().optional().or(z.literal("")),
  saveMode: z.enum(["draft", "active"]).optional(),
  appliedTemplate: z.string().trim().optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  internalNotes: z.string().trim().optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenants = await listTenants({
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      plan: url.searchParams.get("plan") ?? undefined,
      onboardingStage: url.searchParams.get("onboardingStage") ?? undefined,
      backupTierId: url.searchParams.get("backupTierId") ?? undefined,
      sortBy: (url.searchParams.get("sortBy") as "created_at" | "organization_name" | "last_activity_at") ??
        undefined,
      sortDir: (url.searchParams.get("sortDir") as "asc" | "desc") ?? undefined
    });
    return NextResponse.json({ tenants });
  } catch (error) {
    const normalized = toPlatformError(error, "Unable to list tenants.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = createTenantSchema.parse(await request.json());
    const created = await createTenantProvisioning({
      organizationName: payload.organizationName,
      slug: payload.slug,
      primaryContactName: payload.primaryContactName,
      primaryContactEmail: payload.primaryContactEmail || undefined,
      primaryContactPhone: payload.primaryContactPhone,
      planPackage: payload.planPackage,
      enabledModulesCsv: payload.enabledModulesCsv,
      onboardingStage: payload.onboardingStage,
      backupTierId: payload.backupTierId,
      firstTenantAdminEmail: payload.firstTenantAdminEmail,
      firstTenantAdminUserId: payload.firstTenantAdminUserId || undefined,
      saveMode: payload.saveMode,
      appliedTemplate: payload.appliedTemplate,
      branding: payload.branding,
      internalNotes: payload.internalNotes
    });
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: "Validation error",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }
    const normalized = toPlatformError(error, "Unable to create tenant provisioning.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}
