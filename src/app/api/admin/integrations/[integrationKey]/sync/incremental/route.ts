import { NextResponse } from "next/server";
import {
  runGivingFuelContactsIncrementalSync,
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
        ? await runGivingFuelContactsIncrementalSync()
        : await runIntegrationSync(
            integrationKey,
            integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY ? "donations" : "contacts",
            { syncRunMode: "incremental" }
          );
    if (result.status === "failed") {
      return NextResponse.json(
        { ...result, message: result.errorSummary ?? "Incremental sync failed." },
        { status: 500 }
      );
    }
    if (result.status === "completed_with_errors") {
      return NextResponse.json({
        ...result,
        message:
          result.errorSummary ??
          "Incremental sync completed with row-level errors. Check Error Queue and Sync History."
      });
    }
    return NextResponse.json({
      ...result,
      message: "Incremental sync completed successfully."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to run incremental sync." },
      { status: 500 }
    );
  }
}
