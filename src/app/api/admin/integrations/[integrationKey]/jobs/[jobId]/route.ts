import { NextResponse } from "next/server";
import { getIntegrationJob } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string; jobId: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey, jobId } = await params;
    const payload = await getIntegrationJob(integrationKey, jobId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load sync job detail" },
      { status: 500 }
    );
  }
}
