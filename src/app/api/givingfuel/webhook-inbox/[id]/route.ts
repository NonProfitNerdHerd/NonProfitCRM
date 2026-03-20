import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getGivingFuelWebhookInboxDetail,
  replayGivingFuelWebhookInboxEvent
} from "@/lib/data/givingfuel-webhook";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const replaySchema = z.object({
  action: z.literal("replay")
});

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await getGivingFuelWebhookInboxDetail(id);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load webhook inbox detail." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = replaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const payload = await replayGivingFuelWebhookInboxEvent(id);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to replay webhook event." },
      { status: 500 }
    );
  }
}
