import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getGivingFuelAdminConfiguration,
  updateGivingFuelAdminConfiguration
} from "@/lib/data/givingfuel-webhook";
import { GIVINGFUEL_WEBHOOK_INTEGRATION_KEY } from "@/lib/integrations/givingfuel-contacts-config";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

const schema = z.object({
  isEnabled: z.boolean().optional(),
  allowModuleAccess: z.boolean().optional(),
  webhookSecret: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional()
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
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load configuration." },
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
    const payload = await updateGivingFuelAdminConfiguration(parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update configuration." },
      { status: 500 }
    );
  }
}
