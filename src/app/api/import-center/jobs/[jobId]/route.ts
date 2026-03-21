import { NextResponse } from "next/server";
import { getImportCenterJob } from "@/lib/import-center/contact-import-service";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_: Request, { params }: RouteContext) {
  try {
    const { jobId } = await params;
    const job = await getImportCenterJob(jobId);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load import job." },
      { status: 500 }
    );
  }
}
