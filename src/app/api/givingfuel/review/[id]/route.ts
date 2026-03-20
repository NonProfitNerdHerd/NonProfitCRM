import { NextResponse } from "next/server";
import { z } from "zod";
import {
  approveGivingFuelReviewItem,
  getGivingFuelReviewDetail,
  rejectGivingFuelReviewItem,
  reprocessGivingFuelReviewItem
} from "@/lib/data/givingfuel-webhook";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    campaignId: z.string().uuid().nullable().optional(),
    donorId: z.string().uuid().nullable().optional(),
    createNewDonor: z.boolean().optional(),
    notes: z.string().nullable().optional()
  }),
  z.object({
    action: z.literal("reject"),
    notes: z.string().nullable().optional()
  }),
  z.object({
    action: z.literal("ignore"),
    notes: z.string().nullable().optional()
  }),
  z.object({
    action: z.literal("reprocess")
  })
]);

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await getGivingFuelReviewDetail(id);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load review item." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    if (parsed.data.action === "approve") {
      const payload = await approveGivingFuelReviewItem({
        importId: id,
        campaignId: parsed.data.campaignId ?? null,
        donorId: parsed.data.donorId ?? null,
        createNewDonor: parsed.data.createNewDonor,
        notes: parsed.data.notes ?? null
      });
      return NextResponse.json(payload);
    }
    if (parsed.data.action === "reprocess") {
      const payload = await reprocessGivingFuelReviewItem({ importId: id });
      return NextResponse.json(payload);
    }
    const payload = await rejectGivingFuelReviewItem({
      importId: id,
      action: parsed.data.action,
      notes: parsed.data.notes ?? null
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update review item." },
      { status: 500 }
    );
  }
}
