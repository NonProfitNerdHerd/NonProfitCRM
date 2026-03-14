import { NextResponse } from "next/server";
import { runSavedReport } from "@/lib/data/reports";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const parsedPage = Number(url.searchParams.get("page") ?? "1");
    const parsedPageSize = Number(url.searchParams.get("pageSize") ?? "25");
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const pageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 25;
    const result = await runSavedReport(id, page, pageSize);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to run saved report" },
      { status: 500 }
    );
  }
}
