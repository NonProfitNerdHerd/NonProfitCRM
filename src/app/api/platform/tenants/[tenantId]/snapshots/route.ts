import { NextResponse } from "next/server";
import { z } from "zod";
import { createTenantSnapshot, getTenantDetail, toPlatformError } from "@/lib/data/platform-admin";

const snapshotRequestSchema = z.object({
  reason: z.string().trim().optional()
});

type RouteParams = {
  params: Promise<{ tenantId: string }>;
};

export async function GET(_: Request, { params }: RouteParams) {
  try {
    const { tenantId } = await params;
    const detail = await getTenantDetail(tenantId);
    return NextResponse.json({ snapshots: detail.snapshots, backupMetadata: detail.backupMetadata });
  } catch (error) {
    const normalized = toPlatformError(error, "Unable to load tenant snapshots.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { tenantId } = await params;
    const payload = snapshotRequestSchema.parse(await request.json());
    const snapshot = await createTenantSnapshot({
      tenantId,
      reason: payload.reason
    });
    return NextResponse.json({ snapshot });
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
    const normalized = toPlatformError(error, "Unable to create tenant snapshot.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}
