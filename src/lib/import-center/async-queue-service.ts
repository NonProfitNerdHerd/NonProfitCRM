import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const IMPORT_CENTER_STORAGE_BUCKET = "import-center-files";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function sanitizeFileName(name: string) {
  const trimmed = toText(name) || "import.csv";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function detectImportFileType(fileName: string): "csv" | "xlsx" | "xls" {
  const lower = toText(fileName).toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".xls")) return "xls";
  return "csv";
}

export async function uploadImportFileToStorage(input: {
  organizationId: string;
  jobId: string;
  file: File;
}) {
  const supabaseAdmin = createAdminClient();
  const safeFileName = sanitizeFileName(input.file.name);
  const objectPath = `${input.organizationId}/${input.jobId}/${Date.now()}-${crypto.randomUUID()}-${safeFileName}`;
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from(IMPORT_CENTER_STORAGE_BUCKET)
    .upload(objectPath, bytes, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false
    });
  if (error) throw error;
  return {
    bucket: IMPORT_CENTER_STORAGE_BUCKET,
    path: objectPath,
    sourceFileType: detectImportFileType(input.file.name)
  };
}

export async function attachImportFileToJob(input: {
  jobId: string;
  bucket: string;
  path: string;
  sourceFileType: "csv" | "xlsx" | "xls";
  sourceSheetName?: string | null;
}) {
  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from("import_center_jobs")
    .update({
      import_file_bucket: input.bucket,
      import_file_path: input.path,
      source_file_type: input.sourceFileType,
      source_sheet_name: toText(input.sourceSheetName) || null,
      status: "queued",
      processor_error: null,
      processing_started_at: null,
      processing_heartbeat_at: null,
      runner_invoked_at: null,
      runner_completed_at: null,
      completed_at: null
    })
    .eq("id", input.jobId);
  if (error) throw error;
}

function resolveSupabaseInvocationConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL for Import Center async processing.");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for Import Center async processing.");
  }
  return { supabaseUrl, serviceRoleKey };
}

export async function triggerImportCenterRunner(input: {
  jobId: string;
  callbackBaseUrl: string;
  callbackBypassToken?: string | null;
}) {
  const { supabaseUrl, serviceRoleKey } = resolveSupabaseInvocationConfig();
  const runnerSecret = process.env.IMPORT_CENTER_RUNNER_SECRET;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(`${supabaseUrl}/functions/v1/import-center-runner`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        ...(runnerSecret ? { "x-import-center-runner-secret": runnerSecret } : {})
      },
      body: JSON.stringify({
        jobId: input.jobId,
        callbackBaseUrl: input.callbackBaseUrl,
        callbackBypassToken: toText(input.callbackBypassToken) || null
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}
