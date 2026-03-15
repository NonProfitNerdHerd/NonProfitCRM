import { NextResponse } from "next/server";
import { campaignSchema } from "@/lib/validation/crm";
import { createChildCampaign } from "@/lib/data/campaigns";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { id: parentCampaignId } = await params;
    const payload = await request.json();
    const parsed = campaignSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const childId = await createChildCampaign(parentCampaignId, parsed.data);
    return NextResponse.json({ id: childId });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create child campaign" },
      { status: 500 }
    );
  }
}
