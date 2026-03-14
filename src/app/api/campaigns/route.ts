import { NextResponse } from "next/server";
import { campaignSchema } from "@/lib/validation/crm";
import { createCampaign, listCampaigns, canCreateCampaigns } from "@/lib/data/campaigns";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;

    const [campaigns, canCreate] = await Promise.all([
      listCampaigns({ status, q }),
      canCreateCampaigns()
    ]);

    return NextResponse.json({ campaigns, canCreate });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = campaignSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const id = await createCampaign(parsed.data);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create campaign" },
      { status: 500 }
    );
  }
}
