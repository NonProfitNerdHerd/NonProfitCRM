import { NextResponse } from "next/server";
import { runIntegrationSync } from "@/lib/data/integrations";

export const maxDuration = 300;

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const result = await runIntegrationSync(integrationKey, "contacts");
    if (result.status === "failed") {
      return NextResponse.json(
        { ...result, message: result.errorSummary ?? "Contact sync failed." },
        { status: 500 }
      );
    }
    if (result.status === "completed_with_errors") {
      return NextResponse.json({
        ...result,
        message:
          result.errorSummary ??
          "Contact sync completed with row-level errors. Check Error Queue and Sync History."
      });
    }
    return NextResponse.json({
      ...result,
      message:
        result.recordsProcessed === 0
          ? "No contact records were returned from the source system."
          : "Contacts sync completed successfully."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to run contact sync" },
      { status: 500 }
    );
  }
}
