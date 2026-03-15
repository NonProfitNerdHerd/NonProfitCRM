import { NextResponse } from "next/server";
import { testIntegrationConnection } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const payload = await _request.json().catch(() => null);
    const apiKey =
      payload && typeof payload.apiKey === "string" ? payload.apiKey : undefined;
    const result = await testIntegrationConnection(integrationKey, apiKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to test connection" },
      { status: 500 }
    );
  }
}
