import { NextResponse } from "next/server";
import { listMailBuilderCampaignOptions } from "@/lib/data/mail-builder";

export async function GET() {
  try {
    const campaigns = await listMailBuilderCampaignOptions();
    return NextResponse.json({ campaigns });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load campaigns." },
      { status: 500 }
    );
  }
}
