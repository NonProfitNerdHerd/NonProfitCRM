import { NextResponse } from "next/server";
import { z } from "zod";
import { listBackupTiers, toPlatformError, upsertBackupTier } from "@/lib/data/platform-admin";

const backupTierSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().min(2),
  name: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  backupFrequency: z.string().trim().min(1),
  retentionDays: z.coerce.number().int().min(1),
  supportsPointInTimeRestore: z.boolean().optional(),
  supportsStagingRestore: z.boolean().optional(),
  supportsCustomRestoreWindow: z.boolean().optional(),
  isCustom: z.boolean().optional(),
  isActive: z.boolean().optional()
});

export async function GET() {
  try {
    const tiers = await listBackupTiers();
    return NextResponse.json({ tiers });
  } catch (error) {
    const normalized = toPlatformError(error, "Unable to list backup tiers.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = backupTierSchema.parse(await request.json());
    const tier = await upsertBackupTier(payload);
    return NextResponse.json({ tier });
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
    const normalized = toPlatformError(error, "Unable to save backup tier.");
    return NextResponse.json({ message: normalized.message }, { status: normalized.status });
  }
}
