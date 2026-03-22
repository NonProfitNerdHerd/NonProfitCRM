import { NextResponse } from "next/server";
import { resetGivingFuelContactsSyncState } from "@/lib/data/integrations";
import { GIVINGFUEL_INTEGRATION_KEY } from "@/lib/integrations/givingfuel-contacts-config";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    if (integrationKey !== GIVINGFUEL_INTEGRATION_KEY) {
      return NextResponse.json(
        { message: "Sync state reset is only available for GivingFuel Contacts." },
        { status: 400 }
      );
    }
    const state = await resetGivingFuelContactsSyncState();
    return NextResponse.json({
      ok: true,
      state,
      message: "Sync state reset. Initial full sync is required before incremental sync."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to reset sync state." },
      { status: 500 }
    );
  }
}
