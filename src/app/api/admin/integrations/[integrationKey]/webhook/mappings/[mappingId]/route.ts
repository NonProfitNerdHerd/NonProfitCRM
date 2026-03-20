import { NextResponse } from "next/server";
import { deleteGivingFuelCampaignMapping } from "@/lib/data/givingfuel-webhook";
import { GIVINGFUEL_WEBHOOK_INTEGRATION_KEY } from "@/lib/integrations/givingfuel-contacts-config";

type RouteProps = {
  params: Promise<{ integrationKey: string; mappingId: string }>;
};

function verifyWebhookIntegrationKey(key: string) {
  if (key !== GIVINGFUEL_WEBHOOK_INTEGRATION_KEY) {
    throw new Error("This endpoint is only available for GivingFuel Webhook integration.");
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey, mappingId } = await params;
    verifyWebhookIntegrationKey(integrationKey);
    const payload = await deleteGivingFuelCampaignMapping(mappingId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete mapping." },
      { status: 500 }
    );
  }
}
