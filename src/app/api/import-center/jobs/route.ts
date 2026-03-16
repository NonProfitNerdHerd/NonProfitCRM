import { NextResponse } from "next/server";
import { executeImportCenterJob } from "@/lib/import-center/execution-service";
import { listImportCenterJobs } from "@/lib/import-center/contact-import-service";

function errorResponse(error: unknown, fallback: string) {
  const value = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };
  const message = String(value?.message ?? "").trim() || fallback;
  return NextResponse.json(
    {
      message,
      details: value?.details ?? null,
      hint: value?.hint ?? null,
      code: value?.code ?? null
    },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "25");
    const jobs = await listImportCenterJobs(limit);
    return NextResponse.json({ jobs });
  } catch (error) {
    return errorResponse(error, "Unable to load import history.");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await executeImportCenterJob({
      importType: payload.importType ?? "contacts",
      fileName: payload.fileName ?? "uploaded.csv",
      rows: payload.rows ?? [],
      mappings: payload.mappings ?? [],
      classification: payload.classification,
      templateId: payload.templateId ?? null,
      tagDelimiter: payload.tagDelimiter ?? null,
      duplicateHandling: payload.duplicateHandling ?? "skip"
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to execute import job.");
  }
}
