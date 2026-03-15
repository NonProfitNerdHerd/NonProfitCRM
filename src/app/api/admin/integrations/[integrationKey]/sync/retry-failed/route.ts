import { NextResponse } from "next/server";
import { retryFailedIntegrationSync } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const result = await retryFailedIntegrationSync(integrationKey);
    const syncStatus = (result as { syncResult?: { status?: string; errorSummary?: string } })
      .syncResult?.status;
    const syncError = (result as { syncResult?: { status?: string; errorSummary?: string } })
      .syncResult?.errorSummary;
    if (syncStatus === "failed") {
      return NextResponse.json(
        { ...result, message: syncError ?? "Retry failed sync did not complete successfully." },
        { status: 500 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to retry sync errors" },
      { status: 500 }
    );
  }
}
