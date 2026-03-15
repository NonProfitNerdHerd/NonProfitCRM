import { NextResponse } from "next/server";
import { listIntegrationJobs } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const jobs = await listIntegrationJobs(integrationKey);
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load sync jobs" },
      { status: 500 }
    );
  }
}
