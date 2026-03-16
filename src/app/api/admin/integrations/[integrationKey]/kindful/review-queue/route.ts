import { NextResponse } from "next/server";
import { listKindfulReviewQueue } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") as "open" | "resolved" | "all" | null) ?? "open";
    const rows = await listKindfulReviewQueue(integrationKey, status);
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load Kindful review queue." },
      { status: 500 }
    );
  }
}
