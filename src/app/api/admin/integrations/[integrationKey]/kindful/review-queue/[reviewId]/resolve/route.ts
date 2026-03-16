import { NextResponse } from "next/server";
import { resolveKindfulReviewQueueItem } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string; reviewId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey, reviewId } = await params;
    const payload = await request.json().catch(() => null);
    const resolutionNotes =
      payload && typeof payload.resolutionNotes === "string" ? payload.resolutionNotes : undefined;
    const result = await resolveKindfulReviewQueueItem({
      integrationKey,
      reviewId,
      resolutionNotes
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to resolve review queue item." },
      { status: 500 }
    );
  }
}
