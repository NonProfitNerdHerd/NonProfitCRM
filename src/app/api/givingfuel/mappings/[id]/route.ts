import { NextResponse } from "next/server";
import { deleteGivingFuelCampaignMapping } from "@/lib/data/givingfuel-webhook";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const payload = await deleteGivingFuelCampaignMapping(id);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete campaign mapping." },
      { status: 500 }
    );
  }
}
