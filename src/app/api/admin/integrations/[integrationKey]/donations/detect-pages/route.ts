import { NextResponse } from "next/server";
import { z } from "zod";
import { detectDonationPagesForIntegration } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

const requestSchema = z.object({
  maxPages: z.number().int().positive().max(25).optional()
});

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const payload = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await detectDonationPagesForIntegration(integrationKey, {
      maxPages: parsed.data.maxPages
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to detect page values." },
      { status: 500 }
    );
  }
}
