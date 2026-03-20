import { NextResponse } from "next/server";
import { getGivingFuelModuleStateForCurrentUser } from "@/lib/data/givingfuel-webhook";

export async function GET() {
  try {
    const payload = await getGivingFuelModuleStateForCurrentUser();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load Giving Fuel module state." },
      { status: 500 }
    );
  }
}
