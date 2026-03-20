import { NextResponse } from "next/server";
import { z } from "zod";
import { getGivingFuelAdminWebhookLog } from "@/lib/data/givingfuel-webhook";
import { GIVINGFUEL_WEBHOOK_INTEGRATION_KEY } from "@/lib/integrations/givingfuel-contacts-config";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).default(10)
});

function verifyWebhookIntegrationKey(key: string) {
  if (key !== GIVINGFUEL_WEBHOOK_INTEGRATION_KEY) {
    throw new Error("This endpoint is only available for GivingFuel Webhook integration.");
  }
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    verifyWebhookIntegrationKey(integrationKey);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get("limit") ?? 10
    });
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const payload = await getGivingFuelAdminWebhookLog(parsed.data.limit);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load webhook log." },
      { status: 500 }
    );
  }
}
