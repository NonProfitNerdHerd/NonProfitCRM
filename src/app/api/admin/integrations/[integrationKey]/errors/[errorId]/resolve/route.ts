import { NextResponse } from "next/server";
import { resolveIntegrationError } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string; errorId: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey, errorId } = await params;
    const result = await resolveIntegrationError(integrationKey, errorId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to resolve integration error" },
      { status: 500 }
    );
  }
}
