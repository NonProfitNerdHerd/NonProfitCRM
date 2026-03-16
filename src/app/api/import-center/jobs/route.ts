import { NextResponse } from "next/server";
import {
  completeContactsImportJob,
  listImportCenterJobs,
  processContactsImportChunk,
  startContactsImportJob
} from "@/lib/import-center/contact-import-service";

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
    const action = String(payload.action ?? "run").toLowerCase();
    let result: Record<string, unknown>;

    if (action === "start") {
      result = await startContactsImportJob({
        fileName: payload.fileName ?? "uploaded.csv",
        totalRows: Number(payload.totalRows ?? 0),
        mappings: payload.mappings ?? [],
        classification: payload.classification,
        templateId: payload.templateId ?? null,
        tagDelimiter: payload.tagDelimiter ?? null,
        duplicateHandling: payload.duplicateHandling ?? "skip"
      });
    } else if (action === "chunk") {
      result = await processContactsImportChunk({
        jobId: payload.jobId,
        rows: payload.rows ?? [],
        rowOffset: Number(payload.rowOffset ?? 0),
        mappings: payload.mappings ?? [],
        classification: payload.classification,
        tagDelimiter: payload.tagDelimiter ?? null,
        duplicateHandling: payload.duplicateHandling ?? "skip"
      });
    } else if (action === "complete") {
      result = await completeContactsImportJob({
        jobId: payload.jobId
      });
    } else {
      throw new Error(`Unsupported import action: ${action}`);
    }

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to execute import job.");
  }
}
