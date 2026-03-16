import { NextResponse } from "next/server";
import { replayKindfulDeadLetterItem } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string; deadLetterId: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey, deadLetterId } = await params;
    const result = await replayKindfulDeadLetterItem(integrationKey, deadLetterId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to replay dead-letter item." },
      { status: 500 }
    );
  }
}
