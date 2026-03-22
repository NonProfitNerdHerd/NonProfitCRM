import { NextResponse } from "next/server";
import {
  runGivingFuelContactsFullSync,
  runIntegrationSync
} from "@/lib/data/integrations";
import {
  GIVINGFUEL_DONATIONS_INTEGRATION_KEY,
  GIVINGFUEL_INTEGRATION_KEY
} from "@/lib/integrations/givingfuel-contacts-config";

export const maxDuration = 300;

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const result =
      integrationKey === GIVINGFUEL_INTEGRATION_KEY
        ? await runGivingFuelContactsFullSync()
        : await runIntegrationSync(
            integrationKey,
            integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY ? "donations" : "all",
            { syncRunMode: "full" }
          );
    if (result.status === "failed") {
      return NextResponse.json(
        { ...result, message: result.errorSummary ?? "Full sync failed." },
        { status: 500 }
      );
    }
    if (result.status === "completed_with_errors") {
      return NextResponse.json({
        ...result,
        message:
          result.errorSummary ??
          "Full sync completed with row-level errors. Check Error Queue and Sync History."
      });
    }
    return NextResponse.json({
      ...result,
      message: "Full sync completed successfully."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to run full sync." },
      { status: 500 }
    );
  }
}
