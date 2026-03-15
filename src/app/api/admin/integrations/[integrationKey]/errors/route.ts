import { NextResponse } from "next/server";
import { listIntegrationErrors } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const errors = await listIntegrationErrors(integrationKey);
    return NextResponse.json({ errors });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load integration error queue" },
      { status: 500 }
    );
  }
}
