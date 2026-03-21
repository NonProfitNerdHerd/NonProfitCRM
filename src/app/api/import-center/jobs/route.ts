import { NextResponse } from "next/server";
import {
  completeContactsImportJob,
  listImportCenterJobs,
  processContactsImportChunk,
  startContactsImportJob
} from "@/lib/import-center/contact-import-service";
import {
  attachImportFileToJob,
  triggerImportCenterRunner,
  uploadImportFileToStorage
} from "@/lib/import-center/async-queue-service";
import { runWithImportCenterExecutionContext } from "@/lib/import-center/execution-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ContactClassificationInput,
  ImportCenterMapping,
  ReimportMatchSettings
} from "@/lib/import-center/types";

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

function resolveVercelBypassToken() {
  return (
    toText(process.env.IMPORT_CENTER_CALLBACK_BYPASS_TOKEN) ||
    toText(process.env.VERCEL_AUTOMATION_BYPASS_SECRET) ||
    toText(process.env.VERCEL_PROTECTION_BYPASS) ||
    toText(process.env.VERCEL_BYPASS_TOKEN) ||
    null
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
      const fileName = toText(metadata.fileName) || file.name || "uploaded.csv";
      const mappings = (metadata.mappings ?? []) as ImportCenterMapping[];
      const classification = (metadata.classification ?? {
        contactType: "person",
        contactCategory: "lead"
      }) as ContactClassificationInput;
      const rerunMatching = (metadata.rerunMatching ?? undefined) as ReimportMatchSettings | undefined;

      const started = await startContactsImportJob({
        fileName,
        totalRows: Number(metadata.totalRows ?? 0),
        mappings,
        classification,
        templateId: metadata.templateId ? toText(metadata.templateId) : null,
        tagDelimiter: metadata.tagDelimiter ? toText(metadata.tagDelimiter) : null,
        duplicateHandling: toText(metadata.duplicateHandling) === "flag" ? "flag" : "skip",
        rerunMatching
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
        jobId: started.jobId,
        callbackBaseUrl: new URL(request.url).origin,
        callbackBypassToken: resolveVercelBypassToken()
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
      result = await startContactsImportJob({
        fileName: toText(payload.fileName) || "uploaded.csv",
        totalRows: Number(payload.totalRows ?? 0),
        mappings: (Array.isArray(payload.mappings) ? payload.mappings : []) as ImportCenterMapping[],
        classification: (payload.classification ?? {
          contactType: "person",
          contactCategory: "lead"
        }) as ContactClassificationInput,
        templateId: toText(payload.templateId) || null,
        tagDelimiter: toText(payload.tagDelimiter) || null,
        duplicateHandling: toText(payload.duplicateHandling) === "flag" ? "flag" : "skip",
        rerunMatching: (payload.rerunMatching ?? undefined) as ReimportMatchSettings | undefined
      });
    } else if (action === "chunk") {
      const jobId = toText(payload.jobId);
      const rows = (Array.isArray(payload.rows) ? payload.rows : []) as Array<Record<string, unknown>>;
      const mappings = (Array.isArray(payload.mappings)
        ? payload.mappings
        : undefined) as ImportCenterMapping[] | undefined;
      const classification = (payload.classification ?? undefined) as
        | ContactClassificationInput
        | undefined;
      const rerunMatching = (payload.rerunMatching ?? undefined) as
        | ReimportMatchSettings
        | undefined;
      if (systemContext) {
        const admin = createAdminClient();
        result = await runWithImportCenterExecutionContext(
          { ...systemContext, supabase: admin },
          async () =>
            processContactsImportChunk({
              jobId,
              rows,
              rowOffset: Number(payload.rowOffset ?? 0),
              mappings,
              classification,
              tagDelimiter: toText(payload.tagDelimiter) || null,
              duplicateHandling: toText(payload.duplicateHandling) === "flag" ? "flag" : "skip",
              rerunMatching
            })
        );
      } else {
        result = await processContactsImportChunk({
          jobId,
          rows,
          rowOffset: Number(payload.rowOffset ?? 0),
          mappings,
          classification,
          tagDelimiter: toText(payload.tagDelimiter) || null,
          duplicateHandling: toText(payload.duplicateHandling) === "flag" ? "flag" : "skip",
          rerunMatching
        });
      }
    } else if (action === "complete") {
      const jobId = toText(payload.jobId);
      if (systemContext) {
        const admin = createAdminClient();
        result = await runWithImportCenterExecutionContext(
          { ...systemContext, supabase: admin },
          async () =>
            completeContactsImportJob({
              jobId
            })
        );
      } else {
        result = await completeContactsImportJob({
          jobId
        });
      }
    } else {
      throw new Error(`Unsupported import action: ${action}`);
    }

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to execute import job.");
  }
}
