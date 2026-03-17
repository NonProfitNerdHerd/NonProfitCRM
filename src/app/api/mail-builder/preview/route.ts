import { NextResponse } from "next/server";
import { z } from "zod";
import { getMailBuilderPreview } from "@/lib/data/mail-builder";

const previewSchema = z.object({
  segment: z.enum(["donors", "donor_organizations", "all"]),
  activityType: z.enum(["all", "transactions"]),
  transactionsFrom: z.string().trim().optional().nullable(),
  transactionsTo: z.string().trim().optional().nullable(),
  campaignId: z.string().trim().optional().nullable()
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = previewSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Validation error",
          issues: parsed.error.flatten()
        },
        { status: 400 }
      );
    }
    const preview = await getMailBuilderPreview(parsed.data);
    return NextResponse.json({ ok: true, ...preview });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : String((error as { message?: string })?.message ?? "Unable to build mail preview.");
    return NextResponse.json(
      { message },
      { status: 500 }
    );
  }
}
