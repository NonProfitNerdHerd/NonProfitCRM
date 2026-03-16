import { NextResponse } from "next/server";
import { approveKindfulCutover, getKindfulCutoverReadiness } from "@/lib/data/integrations";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const url = new URL(request.url);
    const quietDaysRaw = Number(url.searchParams.get("quietDays") ?? "7");
    const readiness = await getKindfulCutoverReadiness(integrationKey, {
      quietDays: Number.isFinite(quietDaysRaw) ? quietDaysRaw : 7
    });
    return NextResponse.json(readiness);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load cutover readiness." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { integrationKey } = await params;
    const payload = await request.json().catch(() => null);
    const notes = payload && typeof payload.notes === "string" ? payload.notes : undefined;
    const quietDaysRaw = payload && Number.isFinite(Number(payload.quietDays))
      ? Number(payload.quietDays)
      : undefined;
    const result = await approveKindfulCutover(integrationKey, {
      notes,
      quietDays: quietDaysRaw
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to approve Kindful cutover." },
      { status: 500 }
    );
  }
}
