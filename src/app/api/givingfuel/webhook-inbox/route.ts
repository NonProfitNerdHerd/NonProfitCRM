import { NextResponse } from "next/server";
import { z } from "zod";
import { listGivingFuelWebhookInbox } from "@/lib/data/givingfuel-webhook";

const querySchema = z.object({
  processingStatus: z.string().optional(),
  validationStatus: z.string().optional(),
  webhookId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      processingStatus: url.searchParams.get("processingStatus") ?? undefined,
      validationStatus: url.searchParams.get("validationStatus") ?? undefined,
      webhookId: url.searchParams.get("webhookId") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const payload = await listGivingFuelWebhookInbox(parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load webhook inbox." },
      { status: 500 }
    );
  }
}
