import { NextResponse } from "next/server";
import { getTagUsage } from "@/lib/data/tags";

type RouteProps = {
  params: Promise<{ tagId: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { tagId } = await params;
    const usage = await getTagUsage(tagId);
    return NextResponse.json(usage);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load tag usage" },
      { status: 500 }
    );
  }
}

