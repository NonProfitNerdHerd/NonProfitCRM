import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getIntegrationDetailForAdmin,
  updateIntegrationConfiguration
} from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

const configurationSchema = z.object({
  name: z.string().optional(),
  baseUrl: z.string().optional(),
  authType: z.string().optional(),
  apiKeyReference: z.string().optional(),
  isEnabled: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  retrySettings: z.record(z.string(), z.unknown()).optional(),
  debugLoggingEnabled: z.boolean().optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  syncSettings: z.record(z.string(), z.unknown()).optional(),
  fieldMapping: z.record(z.string(), z.unknown()).optional()
});

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const data = await getIntegrationDetailForAdmin(integrationKey);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load integration detail" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const payload = await request.json();
    const parsed = configurationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const connection = await updateIntegrationConfiguration(integrationKey, parsed.data);
    return NextResponse.json({ connection });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update integration config" },
      { status: 500 }
    );
  }
}
