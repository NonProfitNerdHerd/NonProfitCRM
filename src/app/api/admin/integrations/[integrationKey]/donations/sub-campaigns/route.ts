import { NextResponse } from "next/server";
import { z } from "zod";
import { createSubCampaignForIntegration } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

const schema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
  externalPageKey: z.string().optional()
});

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const payload = await request.json();
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const subCampaign = await createSubCampaignForIntegration(integrationKey, parsed.data);
    return NextResponse.json({ subCampaign });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create sub-campaign." },
      { status: 500 }
    );
  }
}
