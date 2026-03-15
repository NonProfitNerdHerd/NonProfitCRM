import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listDonationPageMappingsForIntegration,
  upsertDonationPageMappingForIntegration
} from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

const upsertSchema = z.object({
  externalPageValue: z.string().min(1),
  campaignId: z.string().uuid(),
  subCampaignId: z.string().uuid().nullable().optional()
});

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const data = await listDonationPageMappingsForIntegration(integrationKey);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load donation mappings." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const payload = await request.json();
    const parsed = upsertSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const mapping = await upsertDonationPageMappingForIntegration(integrationKey, {
      externalPageValue: parsed.data.externalPageValue,
      campaignId: parsed.data.campaignId,
      subCampaignId: parsed.data.subCampaignId ?? null
    });
    return NextResponse.json({ mapping });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to save donation mapping." },
      { status: 500 }
    );
  }
}
