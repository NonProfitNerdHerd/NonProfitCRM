import { NextResponse } from "next/server";
import { runIntegrationSync } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    if (integrationKey === "webconnex") {
      return NextResponse.json(
        { message: "GivingFuel Contacts integration does not include donations sync." },
        { status: 400 }
      );
    }
    const result = await runIntegrationSync(integrationKey, "donations");
    if (result.status === "failed") {
      return NextResponse.json(
        { ...result, message: result.errorSummary ?? "Donation sync failed." },
        { status: 500 }
      );
    }
    if (result.status === "completed_with_errors") {
      return NextResponse.json({
        ...result,
        message:
          result.errorSummary ??
          "Donation sync completed with row-level errors. Check Error Queue and Sync History."
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to run donation sync" },
      { status: 500 }
    );
  }
}
