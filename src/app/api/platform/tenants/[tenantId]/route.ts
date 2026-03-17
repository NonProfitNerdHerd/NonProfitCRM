import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantDetail, toPlatformError, updateTenantConfiguration } from "@/lib/data/platform-admin";

const updateTenantSchema = z.object({
  status: z.string().trim().optional(),
  planPackage: z.string().trim().optional(),
  onboardingStage: z.string().trim().optional(),
  backupTierId: z.string().trim().optional().nullable(),
  primaryContactName: z.string().trim().optional().nullable(),
  primaryContactEmail: z.string().trim().optional().nullable(),
  primaryContactPhone: z.string().trim().optional().nullable(),
  internalNotes: z.string().trim().optional().nullable(),
  enabledModules: z.array(z.string().trim()).optional()
});

type RouteParams = {
  params: Promise<{ tenantId: string }>;
};

export async function GET(_: Request, { params }: RouteParams) {
  try {
    const { tenantId } = await params;
    const detail = await getTenantDetail(tenantId);
    return NextResponse.json(detail);
  } catch (error) {
    const normalized = toPlatformError(error, "Unable to load tenant detail.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { tenantId } = await params;
    const payload = updateTenantSchema.parse(await request.json());
    const updated = await updateTenantConfiguration(tenantId, payload);
    return NextResponse.json({ tenant: updated });
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
    const normalized = toPlatformError(error, "Unable to update tenant configuration.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}
