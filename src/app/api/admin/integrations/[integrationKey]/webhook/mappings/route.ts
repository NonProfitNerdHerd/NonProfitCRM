import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getGivingFuelAdminConfiguration,
  upsertGivingFuelCampaignMapping
} from "@/lib/data/givingfuel-webhook";
import { GIVINGFUEL_WEBHOOK_INTEGRATION_KEY } from "@/lib/integrations/givingfuel-contacts-config";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

const schema = z.object({
  mappingId: z.string().uuid().nullable().optional(),
  externalPageId: z.string().min(1),
  externalPageKey: z.string().nullable().optional(),
  externalPageName: z.string().nullable().optional(),
  crmCampaignId: z.string().uuid(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional()
});

function verifyWebhookIntegrationKey(key: string) {
  if (key !== GIVINGFUEL_WEBHOOK_INTEGRATION_KEY) {
    throw new Error("This endpoint is only available for GivingFuel Webhook integration.");
  }
}

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    verifyWebhookIntegrationKey(integrationKey);
    const payload = await getGivingFuelAdminConfiguration();
    return NextResponse.json({
      campaigns: payload.campaigns,
      mappings: payload.mappings
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load mappings." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    verifyWebhookIntegrationKey(integrationKey);
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
      { message: error instanceof Error ? error.message : "Failed to save mapping." },
      { status: 500 }
    );
  }
}
