import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createRestoreRequest,
  listRestoreRequests,
  toPlatformError
} from "@/lib/data/platform-admin";

const restoreRequestSchema = z.object({
  tenantId: z.string().uuid(),
  backupSnapshotId: z.string().uuid().optional(),
  backupPointInTime: z.string().trim().optional(),
  reason: z.string().trim().min(3),
  restoreTarget: z.enum(["production", "staging_tenant", "staging_workspace"]),
  stagingTenantId: z.string().uuid().optional().nullable(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requests = await listRestoreRequests({
      tenantId: url.searchParams.get("tenantId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined
    });
    return NextResponse.json({ requests });
  } catch (error) {
    const normalized = toPlatformError(error, "Unable to list restore requests.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = restoreRequestSchema.parse(await request.json());
    const result = await createRestoreRequest(payload);
    return NextResponse.json(result);
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
    const normalized = toPlatformError(error, "Unable to create restore request.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}
