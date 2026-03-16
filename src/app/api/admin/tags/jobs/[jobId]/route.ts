import { NextResponse } from "next/server";
import { getTagAssignmentJob } from "@/lib/data/tags";

type RouteProps = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { jobId } = await params;
    const payload = await getTagAssignmentJob(jobId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load tag assignment job" },
      { status: 500 }
    );
  }
}

