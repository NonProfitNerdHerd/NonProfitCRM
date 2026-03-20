import { NextResponse } from "next/server";
import { getGivingFuelOperationalDashboard } from "@/lib/data/givingfuel-webhook";

export async function GET() {
  try {
    const payload = await getGivingFuelOperationalDashboard();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load Giving Fuel dashboard." },
      { status: 500 }
    );
  }
}
