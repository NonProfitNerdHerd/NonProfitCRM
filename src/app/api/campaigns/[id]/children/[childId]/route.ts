import { NextResponse } from "next/server";
import { campaignSchema } from "@/lib/validation/crm";
import { updateChildCampaign } from "@/lib/data/campaigns";

type RouteProps = {
  params: Promise<{ id: string; childId: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id: parentCampaignId, childId } = await params;
    const payload = await request.json();
    const parsed = campaignSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    await updateChildCampaign(parentCampaignId, childId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update child campaign" },
      { status: 500 }
    );
  }
}
