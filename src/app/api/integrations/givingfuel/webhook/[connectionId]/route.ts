import { NextResponse } from "next/server";
import { processGivingFuelWebhookRequest } from "@/lib/data/givingfuel-webhook";

type RouteProps = {
  params: Promise<{ connectionId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { connectionId: webhookId } = await params;
    const rawBody = await request.text();
    const result = await processGivingFuelWebhookRequest({
      webhookId,
      requestMethod: request.method,
      requestUrl: request.url,
      headers: request.headers,
      rawBody
    });
    return NextResponse.json(result.body, { status: result.statusCode });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Webhook processing failed." },
      { status: 500 }
    );
  }
}
