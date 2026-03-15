import { NextResponse } from "next/server";
import { listRecentSyncedContactsForIntegration } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    const contacts = await listRecentSyncedContactsForIntegration(integrationKey, limit);
    return NextResponse.json({ contacts });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load synced contacts" },
      { status: 500 }
    );
  }
}
