import { NextResponse } from "next/server";
import { retryFailedIntegrationSync } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const result = await retryFailedIntegrationSync(integrationKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to retry sync errors" },
      { status: 500 }
    );
  }
}
