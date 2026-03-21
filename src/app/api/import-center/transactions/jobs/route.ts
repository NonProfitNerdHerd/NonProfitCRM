import { NextResponse } from "next/server";
import {
  completeTransactionsImportJob,
  processTransactionsImportChunk,
  startTransactionsImportJob
} from "@/lib/import-center/transaction-import-service";
import type { ImportCenterMapping, TransactionImportConfig } from "@/lib/import-center/types";
import {
  attachImportFileToJob,
  triggerImportCenterRunner,
  uploadImportFileToStorage
} from "@/lib/import-center/async-queue-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWithImportCenterExecutionContext } from "@/lib/import-center/execution-context";

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

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  const text = toText(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function resolveRunnerSystemContext(request: Request, payload: Record<string, unknown>) {
  const configuredSecret = toText(
    process.env.IMPORT_CENTER_RUNNER_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_KEY
  );
  const incomingSecret = toText(request.headers.get("x-import-center-runner-secret"));
  if (!configuredSecret || incomingSecret !== configuredSecret) return null;
  const systemContext = (payload.systemContext ?? {}) as Record<string, unknown>;
  const organizationId = toText(systemContext.organizationId);
  const userId = toText(systemContext.userId);
  if (!organizationId || !userId) return null;
  return { organizationId, userId };
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const action = toText(formData.get("action") ?? "enqueue").toLowerCase();
      if (action !== "enqueue") {
        throw new Error(`Unsupported multipart import action: ${action}`);
      }

      const file = formData.get("file");
      if (!(file instanceof File)) {
        throw new Error("Import file is required.");
      }

      const metadata = safeParseJson<Record<string, unknown>>(formData.get("metadata"), {});
      const started = await startTransactionsImportJob({
        fileName: toText(metadata.fileName) || file.name || "uploaded.csv",
        totalRows: Number(metadata.totalRows ?? 0),
        mappings: (metadata.mappings ?? []) as ImportCenterMapping[],
        templateId: metadata.templateId ? toText(metadata.templateId) : null,
        config: (metadata.config ?? {}) as TransactionImportConfig
      });

      const upload = await uploadImportFileToStorage({
        organizationId: started.organizationId,
        jobId: started.jobId,
        file
      });
      await attachImportFileToJob({
        jobId: started.jobId,
        bucket: upload.bucket,
        path: upload.path,
        sourceFileType: upload.sourceFileType,
        sourceSheetName: toText(metadata.selectedSheet) || null
      });

      await triggerImportCenterRunner({
        jobId: started.jobId
      }).catch(async (triggerError) => {
        const admin = createAdminClient();
        await admin
          .from("import_center_jobs")
          .update({
            status: "failed",
            processor_error:
              triggerError instanceof Error
                ? triggerError.message.slice(0, 4000)
                : "Unable to trigger Import Center runner.",
            completed_at: new Date().toISOString()
          })
          .eq("id", started.jobId);
        throw triggerError;
      });

      return NextResponse.json({
        jobId: started.jobId,
        status: "queued"
      });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "run").toLowerCase();
    const systemContext = resolveRunnerSystemContext(request, payload);
    let result: Record<string, unknown>;

    if (action === "start") {
      result = await startTransactionsImportJob({
        fileName: toText(payload.fileName) || "uploaded.csv",
        totalRows: Number(payload.totalRows ?? 0),
        mappings: (Array.isArray(payload.mappings) ? payload.mappings : []) as ImportCenterMapping[],
        templateId: toText(payload.templateId) || null,
        config: (payload.config ?? {}) as TransactionImportConfig
      });
    } else if (action === "chunk") {
      const jobId = toText(payload.jobId);
      const rows = (Array.isArray(payload.rows) ? payload.rows : []) as Array<Record<string, unknown>>;
      const mappings = (Array.isArray(payload.mappings)
        ? payload.mappings
        : undefined) as ImportCenterMapping[] | undefined;
      const config = (payload.config ?? undefined) as TransactionImportConfig | undefined;
      if (systemContext) {
        const admin = createAdminClient();
        result = await runWithImportCenterExecutionContext(
          { ...systemContext, supabase: admin },
          async () =>
            processTransactionsImportChunk({
              jobId,
              rows,
              rowOffset: Number(payload.rowOffset ?? 0),
              mappings,
              config
            })
        );
      } else {
        result = await processTransactionsImportChunk({
          jobId,
          rows,
          rowOffset: Number(payload.rowOffset ?? 0),
          mappings,
          config
        });
      }
    } else if (action === "complete") {
      const jobId = toText(payload.jobId);
      if (systemContext) {
        const admin = createAdminClient();
        result = await runWithImportCenterExecutionContext(
          { ...systemContext, supabase: admin },
          async () =>
            completeTransactionsImportJob({
              jobId
            })
        );
      } else {
        result = await completeTransactionsImportJob({
          jobId
        });
      }
    } else {
      throw new Error(`Unsupported import action: ${action}`);
    }

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to execute transactions import job.");
  }
}
