// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import Papa from "npm:papaparse@5.5.3";
import * as XLSX from "npm:xlsx@0.18.5";

type ImportJobRow = {
  id: string;
  organization_id: string;
  uploaded_by: string | null;
  import_type: "contacts" | "transactions";
  status: string;
  total_rows: number | null;
  import_file_bucket: string | null;
  import_file_path: string | null;
  source_file_type: string | null;
  source_sheet_name: string | null;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function ensureEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function parseCsvRows(csvText: string) {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message);
  }
  return parsed.data;
}

function parseWorkbookRows(buffer: ArrayBuffer, preferredSheet?: string | null) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const selectedSheet =
    preferredSheet && workbook.SheetNames.includes(preferredSheet)
      ? preferredSheet
      : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
}

function routeForImportType(importType: string) {
  return importType === "transactions"
    ? "/api/import-center/transactions/jobs"
    : "/api/import-center/jobs";
}

function sanitizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function appendBypassToken(url: string, bypassToken: string | null) {
  if (!bypassToken) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("x-vercel-protection-bypass", bypassToken);
  return parsed.toString();
}

async function markJobFailed(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  errorMessage: string
) {
  await supabase
    .from("import_center_jobs")
    .update({
      status: "failed",
      processor_error: errorMessage.slice(0, 4000),
      processing_heartbeat_at: new Date().toISOString(),
      runner_completed_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    })
    .eq("id", jobId);
}

Deno.serve(async (request) => {
  let requestPayload: Record<string, unknown> = {};
  if (request.method !== "POST") {
    return json({ message: "Method not allowed." }, 405);
  }

  try {
    const runnerSecret = toText(Deno.env.get("IMPORT_CENTER_RUNNER_SECRET"));
    if (runnerSecret) {
      const incomingSecret = toText(request.headers.get("x-import-center-runner-secret"));
      if (incomingSecret !== runnerSecret) {
        return json({ message: "Unauthorized runner request." }, 401);
      }
    }

    const supabaseUrl = ensureEnv("SUPABASE_URL");
    const serviceRoleKey = ensureEnv("SUPABASE_SERVICE_ROLE_KEY");
    const callbackSecret = runnerSecret || serviceRoleKey;
    requestPayload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const jobId = toText(requestPayload.jobId);
    const callbackBaseUrl = sanitizeBaseUrl(toText(requestPayload.callbackBaseUrl));
    const callbackBypassToken = toText(requestPayload.callbackBypassToken) || null;
    if (!jobId) return json({ message: "jobId is required." }, 400);
    if (!callbackBaseUrl) return json({ message: "callbackBaseUrl is required." }, 400);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const claimRes = await supabase
      .from("import_center_jobs")
      .update({
        status: "processing",
        processor_error: null,
        processing_started_at: new Date().toISOString(),
        processing_heartbeat_at: new Date().toISOString(),
        runner_invoked_at: new Date().toISOString(),
        runner_completed_at: null
      })
      .eq("id", jobId)
      .eq("status", "queued")
      .select(
        "id,organization_id,uploaded_by,import_type,status,total_rows,import_file_bucket,import_file_path,source_file_type,source_sheet_name"
      )
      .maybeSingle();
    if (claimRes.error) {
      throw new Error(claimRes.error.message);
    }

    let job = claimRes.data as ImportJobRow | null;
    if (!job) {
      const existingRes = await supabase
        .from("import_center_jobs")
        .select(
          "id,organization_id,uploaded_by,import_type,status,total_rows,import_file_bucket,import_file_path,source_file_type,source_sheet_name"
        )
        .eq("id", jobId)
        .maybeSingle();
      if (existingRes.error) throw new Error(existingRes.error.message);
      const existing = existingRes.data as ImportJobRow | null;
      return json({
        ok: true,
        skipped: true,
        reason: existing ? `Job is already ${existing.status}.` : "Job not found."
      });
    }

    if (!job.import_file_path) {
      throw new Error("Import job is missing import_file_path.");
    }
    if (!job.uploaded_by) {
      throw new Error("Import job is missing uploaded_by.");
    }

    const bucket = toText(job.import_file_bucket) || "import-center-files";
    const fileRes = await supabase.storage.from(bucket).download(job.import_file_path);
    if (fileRes.error || !fileRes.data) {
      throw new Error(fileRes.error?.message ?? "Unable to download import file from storage.");
    }

    const sourceType = toText(job.source_file_type).toLowerCase();
    const rows =
      sourceType === "xlsx" || sourceType === "xls"
        ? parseWorkbookRows(await fileRes.data.arrayBuffer(), job.source_sheet_name)
        : parseCsvRows(await fileRes.data.text());

    await supabase
      .from("import_center_jobs")
      .update({
        total_rows: rows.length,
        processed_rows: 0,
        successful_rows: 0,
        failed_rows: 0,
        skipped_rows: 0,
        processing_heartbeat_at: new Date().toISOString()
      })
      .eq("id", job.id);

    const route = routeForImportType(job.import_type);
    const chunkSize = 100;
    const runnerHeaders: Record<string, string> = {
      "content-type": "application/json",
      "x-import-center-runner-secret": callbackSecret
    };
    if (callbackBypassToken) {
      runnerHeaders["x-vercel-protection-bypass"] = callbackBypassToken;
    }

    for (let rowOffset = 0; rowOffset < rows.length; rowOffset += chunkSize) {
      const chunk = rows.slice(rowOffset, rowOffset + chunkSize);
      const chunkResponse = await fetch(appendBypassToken(`${callbackBaseUrl}${route}`, callbackBypassToken), {
        method: "POST",
        headers: runnerHeaders,
        body: JSON.stringify({
          action: "chunk",
          jobId: job.id,
          rows: chunk,
          rowOffset,
          systemContext: {
            organizationId: job.organization_id,
            userId: job.uploaded_by
          }
        })
      });
      if (!chunkResponse.ok) {
        const details = await chunkResponse.text().catch(() => "");
        if (details.toLowerCase().includes("authentication required")) {
          throw new Error(
            "Chunk processing was blocked by Vercel Authentication. Set IMPORT_CENTER_CALLBACK_BYPASS_TOKEN (or VERCEL_AUTOMATION_BYPASS_SECRET) in the app environment."
          );
        }
        throw new Error(
          `Chunk processing failed at row ${rowOffset + 1}. ${details.slice(0, 500)}`
        );
      }

      await supabase
        .from("import_center_jobs")
        .update({
          processing_heartbeat_at: new Date().toISOString(),
          processed_rows: Math.min(rows.length, rowOffset + chunk.length)
        })
        .eq("id", job.id);
    }

    const completeResponse = await fetch(
      appendBypassToken(`${callbackBaseUrl}${route}`, callbackBypassToken),
      {
      method: "POST",
      headers: runnerHeaders,
      body: JSON.stringify({
        action: "complete",
        jobId: job.id,
        systemContext: {
          organizationId: job.organization_id,
          userId: job.uploaded_by
        }
      })
    }
    );
    if (!completeResponse.ok) {
      const details = await completeResponse.text().catch(() => "");
      if (details.toLowerCase().includes("authentication required")) {
        throw new Error(
          "Import finalization was blocked by Vercel Authentication. Set IMPORT_CENTER_CALLBACK_BYPASS_TOKEN (or VERCEL_AUTOMATION_BYPASS_SECRET) in the app environment."
        );
      }
      throw new Error(`Unable to finalize import job. ${details.slice(0, 500)}`);
    }

    await supabase
      .from("import_center_jobs")
      .update({
        processing_heartbeat_at: new Date().toISOString(),
        runner_completed_at: new Date().toISOString(),
        processed_rows: rows.length
      })
      .eq("id", job.id);

    return json({ ok: true, jobId: job.id, totalRows: rows.length });
  } catch (error) {
    const jobId = toText(requestPayload.jobId);
    const message = error instanceof Error ? error.message : "Unknown import runner failure.";
    try {
      if (jobId) {
        const supabase = createClient(ensureEnv("SUPABASE_URL"), ensureEnv("SUPABASE_SERVICE_ROLE_KEY"), {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        await markJobFailed(supabase, jobId, message);
      }
    } catch {
      // Ignore secondary failure while trying to mark the job as failed.
    }
    return json({ message }, 500);
  }
});
