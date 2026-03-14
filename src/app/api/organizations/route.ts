import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createCrmOrganization,
  listCrmOrganizations
} from "@/lib/data/crm-organizations";

const orgSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional()
});

export async function GET() {
  try {
    const organizations = await listCrmOrganizations();
    return NextResponse.json({ organizations });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to load organizations"
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = orgSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const id = await createCrmOrganization(parsed.data);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to create organization"
      },
      { status: 500 }
    );
  }
}
