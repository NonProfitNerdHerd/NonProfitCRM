import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/data/campaigns";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const result = await getCampaign(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load campaign" },
      { status: 500 }
    );
  }
}
