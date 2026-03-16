import { NextResponse } from "next/server";
import { listTagAssignmentJobs } from "@/lib/data/tags";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const jobs = await listTagAssignmentJobs({ status, limit });
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load tag assignment jobs" },
      { status: 500 }
    );
  }
}

