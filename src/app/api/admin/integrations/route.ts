import { NextResponse } from "next/server";
import { listIntegrationsForAdmin } from "@/lib/data/integrations";

export async function GET() {
  try {
    const data = await listIntegrationsForAdmin();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load integrations" },
      { status: 500 }
    );
  }
}
