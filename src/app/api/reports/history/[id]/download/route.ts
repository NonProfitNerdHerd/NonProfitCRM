import { NextResponse } from "next/server";
import { downloadReportRunById } from "@/lib/data/reports";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const output = await downloadReportRunById(id);
    return new NextResponse(output.data, {
      headers: {
        "content-type": output.contentType,
        "content-disposition": `attachment; filename="${output.fileName}"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to download report artifact." },
      { status: 500 }
    );
  }
}
