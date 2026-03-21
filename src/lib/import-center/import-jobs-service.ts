import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  IMPORT_CENTER_STORAGE_BUCKET,
  triggerImportCenterRunner
} from "@/lib/import-center/async-queue-service";
import { resolveImportCenterExecution } from "@/lib/import-center/execution-context";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toIso(value: unknown) {
  const text = toText(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function appendProcessorLog(current: unknown, line: string, maxChars = 16000) {
  const existing = toText(current);
  const next = [existing, `${new Date().toISOString()} ${line}`].filter(Boolean).join("\n");
  return next.length <= maxChars ? next : next.slice(next.length - maxChars);
}

function resolveLastActivity(job: Record<string, unknown>) {
  return (
    toText(job.last_activity_at) ||
    toText(job.processing_heartbeat_at) ||
    toText(job.updated_at) ||
    toText(job.started_at) ||
    toText(job.created_at) ||
    null
  );
}

function computeProgress(job: Record<string, unknown>) {
  const totalRows = Math.max(0, toNumber(job.total_rows, 0));
  const processedRows = Math.max(
    0,
    toNumber(
      job.processed_rows,
      toNumber(job.successful_rows, 0) + toNumber(job.failed_rows, 0) + toNumber(job.skipped_rows, 0)
    )
  );
  if (totalRows <= 0) return { processedRows, percent: 0 };
  return {
    processedRows,
    percent: clamp(Math.round((processedRows / totalRows) * 100), 0, 100)
  };
}

export type ImportJobsListInput = {
  limit?: number;
  offset?: number;
  status?: string | null;
  importType?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  submittedBy?: string | null;
  fileSearch?: string | null;
  stalledThresholdMinutes?: number;
};

export async function markStalledImportJobs(stalledThresholdMinutes = 10) {
  const { context, supabase } = await resolveImportCenterExecution();
  const thresholdMinutes = clamp(stalledThresholdMinutes, 2, 60);
  const cutoffMs = Date.now() - thresholdMinutes * 60 * 1000;

  const { data, error } = await supabase
    .from("import_center_jobs")
    .select("id,status,last_activity_at,processing_heartbeat_at,updated_at,started_at,processed_rows,total_rows")
    .eq("organization_id", context.organizationId)
    .in("status", ["processing", "queued"]);
  if (error) throw error;

  const staleIds = (data ?? [])
    .filter((row) => {
      const status = toText(row.status);
      const processed = toNumber(row.processed_rows, 0);
      const total = toNumber(row.total_rows, 0);
      const staleEligible =
        status === "processing" || (status === "queued" && total > 0 && processed < total);
      if (!staleEligible) return false;
      const candidate =
        toIso(row.last_activity_at) ||
        toIso(row.processing_heartbeat_at) ||
        toIso(row.updated_at) ||
        toIso(row.started_at);
      if (!candidate) return false;
      const stamp = new Date(candidate).getTime();
      return Number.isFinite(stamp) && stamp < cutoffMs;
    })
    .map((row) => toText(row.id))
    .filter(Boolean);

  if (staleIds.length === 0) return { staleCount: 0 };

  const reason = `No activity detected for ${thresholdMinutes} minutes.`;
  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("import_center_jobs")
    .update({
      status: "stalled",
      last_error_message: reason,
      processor_error: reason,
      runner_completed_at: nowIso,
      completed_at: nowIso,
      last_activity_at: nowIso,
      runner_lock_token: null,
      runner_lock_expires_at: null
    })
    .eq("organization_id", context.organizationId)
    .in("id", staleIds);
  if (updateError) throw updateError;

  return { staleCount: staleIds.length };
}

export async function listImportJobs(input: ImportJobsListInput = {}) {
  const { context, supabase } = await resolveImportCenterExecution();
  await markStalledImportJobs(input.stalledThresholdMinutes ?? 10).catch(() => null);

  const limit = clamp(toNumber(input.limit, 25), 1, 250);
  const offset = Math.max(0, toNumber(input.offset, 0));
  const fromDate = toIso(input.fromDate);
  const toDate = toIso(input.toDate);
  const statusFilter = toText(input.status);
  const importTypeFilter = toText(input.importType);
  const submittedBy = toText(input.submittedBy);
  const fileSearch = toText(input.fileSearch);

  let query = supabase
    .from("import_center_jobs")
    .select("*", { count: "exact" })
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    const statuses = statusFilter
      .split(",")
      .map((value) => toText(value))
      .filter(Boolean);
    if (statuses.length > 0) query = query.in("status", statuses);
  }
  if (importTypeFilter) {
    const importTypes = importTypeFilter
      .split(",")
      .map((value) => toText(value))
      .filter(Boolean);
    if (importTypes.length > 0) query = query.in("import_type", importTypes);
  }
  if (fromDate) query = query.gte("created_at", fromDate);
  if (toDate) query = query.lte("created_at", toDate);
  if (submittedBy) query = query.eq("uploaded_by", submittedBy);
  if (fileSearch) query = query.ilike("file_name", `%${fileSearch}%`);

  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;

  const submitterIds = Array.from(new Set((data ?? []).map((row) => toText(row.uploaded_by)).filter(Boolean)));
  const submitterMap = new Map<string, string>();
  if (submitterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", submitterIds);
    for (const profile of profiles ?? []) {
      submitterMap.set(toText(profile.id), toText(profile.display_name));
    }
  }

  const jobs = (data ?? []).map((job) => {
    const row = job as Record<string, unknown>;
    const progress = computeProgress(row);
    return {
      ...row,
      processed_rows: progress.processedRows,
      progress_percent: progress.percent,
      submitted_by_name:
        submitterMap.get(toText(row.uploaded_by)) || toText(row.uploaded_by) || "Unknown",
      last_activity_at: resolveLastActivity(row),
      last_error_message: toText(row.last_error_message) || toText(row.processor_error) || null
    };
  });

  return {
    jobs,
    total: toNumber(count, jobs.length),
    offset,
    limit
  };
}

export async function listImportJobErrorsPaged(input: {
  jobId: string;
  offset?: number;
  limit?: number;
  search?: string | null;
}) {
  const { context, supabase } = await resolveImportCenterExecution();
  const offset = Math.max(0, toNumber(input.offset, 0));
  const limit = clamp(toNumber(input.limit, 50), 1, 20000);
  const search = toText(input.search);

  let query = supabase
    .from("import_center_job_errors")
    .select("id,row_index,error_message,raw_row,created_at", { count: "exact" })
    .eq("organization_id", context.organizationId)
    .eq("import_center_job_id", input.jobId)
    .order("row_index", { ascending: true });
  if (search) query = query.ilike("error_message", `%${search}%`);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: toNumber(count, (data ?? []).length), offset, limit };
}

export async function getImportJobDetail(input: {
  jobId: string;
  failedOffset?: number;
  failedLimit?: number;
  failedSearch?: string | null;
}) {
  const { context, supabase } = await resolveImportCenterExecution();
  await markStalledImportJobs(10).catch(() => null);

  const { data: job, error: jobError } = await supabase
    .from("import_center_jobs")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", input.jobId)
    .single();
  if (jobError) throw jobError;

  const submitterId = toText(job.uploaded_by);
  let submittedByName = submitterId || "Unknown";
  if (submitterId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", submitterId)
      .maybeSingle();
    submittedByName = toText(profile?.display_name) || submitterId;
  }

  const failedRows = await listImportJobErrorsPaged({
    jobId: input.jobId,
    offset: input.failedOffset ?? 0,
    limit: input.failedLimit ?? 50,
    search: input.failedSearch ?? null
  });
  const jobRecord = job as Record<string, unknown>;
  const progress = computeProgress(jobRecord);

  return {
    job: {
      ...jobRecord,
      submitted_by_name: submittedByName,
      processed_rows: progress.processedRows,
      progress_percent: progress.percent,
      last_activity_at: resolveLastActivity(jobRecord),
      last_error_message: toText(jobRecord.last_error_message) || toText(jobRecord.processor_error) || null
    },
    failedRows
  };
}

export async function requestStopImportJob(jobId: string) {
  const { context, supabase } = await resolveImportCenterExecution();
  const { data: job, error } = await supabase
    .from("import_center_jobs")
    .select("id,status,processor_log")
    .eq("organization_id", context.organizationId)
    .eq("id", jobId)
    .single();
  if (error) throw error;

  const status = toText(job.status);
  if (["completed", "completed_with_errors", "failed", "cancelled", "stalled"].includes(status)) {
    return { jobId, status, alreadyTerminal: true };
  }

  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {
    stop_requested: true,
    stop_requested_at: nowIso,
    last_activity_at: nowIso,
    processor_log: appendProcessorLog(job.processor_log, `Stop requested by ${context.userId}.`)
  };
  if (status === "queued") {
    updates.status = "cancelled";
    updates.stopped_at = nowIso;
    updates.completed_at = nowIso;
    updates.runner_completed_at = nowIso;
    updates.last_error_message = "Stopped by user request before processing began.";
    updates.processor_error = "Stopped by user request before processing began.";
  }

  const { error: updateError } = await supabase
    .from("import_center_jobs")
    .update(updates)
    .eq("organization_id", context.organizationId)
    .eq("id", jobId);
  if (updateError) throw updateError;

  return { jobId, status: status === "queued" ? "cancelled" : "stop_requested" };
}

function buildCsvFromFailedRows(rows: Array<Record<string, unknown>>, includeErrorColumn: boolean) {
  const rawRows = rows.map((row) => (row.raw_row ?? {}) as Record<string, unknown>);
  const headers = Array.from(new Set(rawRows.flatMap((raw) => Object.keys(raw ?? {}))));
  const outputHeaders = includeErrorColumn ? [...headers, "__error_message"] : headers;
  const lines = [outputHeaders.map((header) => escapeCsv(header)).join(",")];
  for (const row of rows) {
    const rawRow = (row.raw_row ?? {}) as Record<string, unknown>;
    const values = outputHeaders.map((header) =>
      escapeCsv(header === "__error_message" ? row.error_message : rawRow[header])
    );
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

export async function requestRetryFailedRows(jobId: string) {
  const { context, supabase } = await resolveImportCenterExecution();
  const { data: sourceJob, error: sourceError } = await supabase
    .from("import_center_jobs")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", jobId)
    .single();
  if (sourceError) throw sourceError;
  const sourceStatus = toText((sourceJob as Record<string, unknown>).status);
  if (!["completed", "completed_with_errors", "failed", "cancelled", "stalled"].includes(sourceStatus)) {
    throw new Error("Retry failed rows is only available for completed, failed, cancelled, or stalled jobs.");
  }

  const { data: failedRows, error: failedError } = await supabase
    .from("import_center_job_errors")
    .select("row_index,error_message,raw_row")
    .eq("organization_id", context.organizationId)
    .eq("import_center_job_id", jobId)
    .order("row_index", { ascending: true });
  if (failedError) throw failedError;
  if (!failedRows || failedRows.length === 0) {
    throw new Error("No failed rows are available to retry.");
  }

  const source = sourceJob as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const { data: retryJob, error: retryError } = await supabase
    .from("import_center_jobs")
    .insert({
      organization_id: context.organizationId,
      import_type: toText(source.import_type),
      file_name: `${toText(source.file_name) || "import.csv"} (retry failed rows)`,
      template_used: source.template_used ?? null,
      uploaded_by: context.userId,
      started_at: nowIso,
      status: "queued",
      total_rows: failedRows.length,
      successful_rows: 0,
      failed_rows: 0,
      skipped_rows: 0,
      processed_rows: 0,
      mapping_configuration_snapshot: source.mapping_configuration_snapshot ?? {},
      classification_snapshot: source.classification_snapshot ?? {},
      tag_configuration: source.tag_configuration ?? {},
      duplicate_handling: toText(source.duplicate_handling) || "skip",
      rerun_matching_enabled: Boolean(source.rerun_matching_enabled),
      source_match_column: source.source_match_column ?? null,
      destination_match_field: source.destination_match_field ?? null,
      on_match_behavior: toText(source.on_match_behavior) || "update_blank_only",
      on_no_match_behavior: toText(source.on_no_match_behavior) || "create_new",
      blank_overwrite_protection_enabled: true,
      parent_job_id: jobId,
      stop_requested: false,
      retry_requested: false,
      last_processed_row: 0,
      last_activity_at: nowIso,
      processor_log: appendProcessorLog(null, `Created from failed rows of job ${jobId}.`)
    })
    .select("id")
    .single();
  if (retryError) throw retryError;

  const retryJobId = toText(retryJob.id);
  const csv = buildCsvFromFailedRows((failedRows as Array<Record<string, unknown>>) ?? [], false);
  const objectPath = `${context.organizationId}/${retryJobId}/${Date.now()}-${crypto.randomUUID()}-failed-rows-retry.csv`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(IMPORT_CENTER_STORAGE_BUCKET)
    .upload(objectPath, new TextEncoder().encode(csv), {
      contentType: "text/csv",
      upsert: false
    });
  if (uploadError) throw uploadError;

  const { error: attachError } = await supabase
    .from("import_center_jobs")
    .update({
      import_file_bucket: IMPORT_CENTER_STORAGE_BUCKET,
      import_file_path: objectPath,
      source_file_type: "csv",
      source_sheet_name: null,
      last_activity_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("id", retryJobId);
  if (attachError) throw attachError;

  await supabase
    .from("import_center_jobs")
    .update({
      retry_requested: true,
      retry_requested_at: new Date().toISOString(),
      processor_log: appendProcessorLog(source.processor_log, `Retry failed rows created as job ${retryJobId}.`)
    })
    .eq("organization_id", context.organizationId)
    .eq("id", jobId);

  await triggerImportCenterRunner({ jobId: retryJobId }).catch(async (triggerError) => {
    const message =
      triggerError instanceof Error
        ? triggerError.message.slice(0, 4000)
        : "Unable to trigger Import Center runner.";
    await createAdminClient()
      .from("import_center_jobs")
      .update({
        status: "failed",
        processor_error: message,
        last_error_message: message,
        completed_at: new Date().toISOString(),
        runner_completed_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .eq("id", retryJobId);
    throw triggerError;
  });
  return { jobId: retryJobId };
}

export async function buildFailureReportCsv(jobId: string) {
  const { rows } = await listImportJobErrorsPaged({ jobId, offset: 0, limit: 20000 });
  const typedRows = rows as Array<Record<string, unknown>>;
  const rawRows = typedRows.map((row) => (row.raw_row ?? {}) as Record<string, unknown>);
  const rawHeaders = Array.from(new Set(rawRows.flatMap((raw) => Object.keys(raw ?? {}))));
  const headers = ["row_number", "error_message", "notes", ...rawHeaders];
  const lines = [headers.map((header) => escapeCsv(header)).join(",")];
  for (const row of typedRows) {
    const raw = (row.raw_row ?? {}) as Record<string, unknown>;
    const values = [
      escapeCsv(row.row_index),
      escapeCsv(row.error_message),
      escapeCsv("Fix and retry import"),
      ...rawHeaders.map((header) => escapeCsv(raw[header]))
    ];
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

export async function buildCorrectedTemplateCsv(jobId: string) {
  const { rows } = await listImportJobErrorsPaged({ jobId, offset: 0, limit: 20000 });
  return buildCsvFromFailedRows((rows as Array<Record<string, unknown>>) ?? [], true);
}

export async function buildJobSummaryCsv(jobId: string) {
  const detail = await getImportJobDetail({ jobId, failedOffset: 0, failedLimit: 1 });
  const job = detail.job as Record<string, unknown>;
  const headers = [
    "job_id",
    "import_type",
    "file_name",
    "status",
    "submitted_by",
    "created_at",
    "started_at",
    "completed_at",
    "total_rows",
    "processed_rows",
    "successful_rows",
    "failed_rows",
    "skipped_rows",
    "last_activity_at",
    "last_error_message"
  ];
  const values = headers.map((header) => escapeCsv(job[header]));
  return [headers.join(","), values.join(",")].join("\n");
}
