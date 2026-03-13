import { NextResponse } from "next/server";
import { runSavedReport } from "@/lib/data/reports";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const result = await runSavedReport(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to run saved report" },
      { status: 500 }
    );
  }
}
