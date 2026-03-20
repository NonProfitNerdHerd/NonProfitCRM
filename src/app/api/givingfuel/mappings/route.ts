import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getGivingFuelPageCampaignConfiguration,
  upsertGivingFuelCampaignMapping
} from "@/lib/data/givingfuel-webhook";

const schema = z.object({
  mappingId: z.string().uuid().nullable().optional(),
  externalPageId: z.string().min(1),
  externalPageKey: z.string().nullable().optional(),
  externalPageName: z.string().nullable().optional(),
  crmCampaignId: z.string().uuid(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional()
});

export async function GET() {
  try {
    const payload = await getGivingFuelPageCampaignConfiguration();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load campaign mappings." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const payload = await upsertGivingFuelCampaignMapping({
      mappingId: parsed.data.mappingId ?? null,
      externalPageId: parsed.data.externalPageId,
      externalPageKey: parsed.data.externalPageKey ?? null,
      externalPageName: parsed.data.externalPageName ?? null,
      crmCampaignId: parsed.data.crmCampaignId,
      isActive: parsed.data.isActive,
      notes: parsed.data.notes ?? null
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to save campaign mapping." },
      { status: 500 }
    );
  }
}
