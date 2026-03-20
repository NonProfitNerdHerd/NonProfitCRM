import { NextResponse } from "next/server";
import { z } from "zod";
import {
  bulkApproveGivingFuelReviewItems,
  listGivingFuelReviewQueue
} from "@/lib/data/givingfuel-webhook";

const bulkApproveSchema = z.object({
  importIds: z.array(z.string().uuid()).min(1)
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const payload = await listGivingFuelReviewQueue({
      status: url.searchParams.get("status") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      campaignId: url.searchParams.get("campaignId") ?? undefined,
      minDonorConfidence: url.searchParams.get("minDonorConfidence")
        ? Number(url.searchParams.get("minDonorConfidence"))
        : undefined,
      search: url.searchParams.get("search") ?? undefined
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load review queue." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = bulkApproveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const payload = await bulkApproveGivingFuelReviewItems(parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Bulk approval failed." },
      { status: 500 }
    );
  }
}
