import { NextResponse } from "next/server";
import {
  completeTransactionsImportJob,
  processTransactionsImportChunk,
  startTransactionsImportJob
} from "@/lib/import-center/transaction-import-service";
import type { ImportCenterMapping, TransactionImportConfig } from "@/lib/import-center/types";

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

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const action = String(payload.action ?? "run").toLowerCase();
    let result: Record<string, unknown>;

    if (action === "start") {
      result = await startTransactionsImportJob({
        fileName: payload.fileName ?? "uploaded.csv",
        totalRows: Number(payload.totalRows ?? 0),
        mappings: (payload.mappings ?? []) as ImportCenterMapping[],
        templateId: payload.templateId ?? null,
        config: (payload.config ?? {}) as TransactionImportConfig
      });
    } else if (action === "chunk") {
      result = await processTransactionsImportChunk({
        jobId: payload.jobId,
        rows: payload.rows ?? [],
        rowOffset: Number(payload.rowOffset ?? 0),
        mappings: payload.mappings ?? undefined,
        config: payload.config ?? undefined
      });
    } else if (action === "complete") {
      result = await completeTransactionsImportJob({
        jobId: payload.jobId
      });
    } else {
      throw new Error(`Unsupported import action: ${action}`);
    }

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to execute transactions import job.");
  }
}
