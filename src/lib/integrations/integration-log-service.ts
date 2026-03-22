import { createIntegrationClient } from "@/lib/integrations/db";
import {
  IntegrationErrorQueueItem,
  IntegrationSyncJob,
  IntegrationSyncLog
} from "@/lib/integrations/types";

function isJobProgressSchemaMissing(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return (
    message.includes("records_retrieved") ||
    message.includes("records_skipped") ||
    message.includes("total_records_expected") ||
    message.includes("current_cursor") ||
    message.includes("current_page") ||
    message.includes("completed_successfully") ||
    message.includes("paging_complete")
  );
}

export class IntegrationLogService {
  async createJob(input: {
    organizationId: string;
    integrationConnectionId: string;
    jobType: string;
    syncScope: string;
    syncRunMode?: "full" | "incremental";
    triggeredBy: string;
    triggeredByType?: string;
  }): Promise<IntegrationSyncJob> {
    const supabase = await createIntegrationClient();
    const payloadWithMode = {
      organization_id: input.organizationId,
      integration_connection_id: input.integrationConnectionId,
      job_type: input.jobType,
      sync_scope: input.syncScope,
      sync_run_mode: input.syncRunMode ?? "incremental",
      status: "running",
      started_date: new Date().toISOString(),
      triggered_by: input.triggeredBy,
      triggered_by_type: input.triggeredByType ?? "manual"
    };
    let { data, error } = await supabase
      .from("integration_sync_jobs")
      .insert(payloadWithMode)
      .select("*")
      .single();

    if (error) {
      const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
      const missingSyncRunMode =
        error.code === "42703" ||
        message.includes("sync_run_mode") ||
        message.includes("column") ||
        message.includes("does not exist");
      if (!missingSyncRunMode) throw error;
      const fallbackResult = await supabase
        .from("integration_sync_jobs")
        .insert({
          organization_id: input.organizationId,
          integration_connection_id: input.integrationConnectionId,
          job_type: input.jobType,
          sync_scope: input.syncScope,
          status: "running",
          started_date: new Date().toISOString(),
          triggered_by: input.triggeredBy,
          triggered_by_type: input.triggeredByType ?? "manual"
        })
        .select("*")
        .single();
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) throw error;
    return data as IntegrationSyncJob;
  }

  async completeJob(input: {
    organizationId: string;
    jobId: string;
    status: "completed" | "failed" | "completed_with_errors";
    recordsRetrieved: number;
    recordsProcessed: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsSkipped: number;
    recordsFailed: number;
    totalRecordsExpected?: number | null;
    currentPage?: number | null;
    completedSuccessfully: boolean;
    pagingComplete: boolean;
    cursor?: string | null;
    lastSuccessfulSyncDate?: string | null;
    errorSummary?: string | null;
    startedDate: string;
  }) {
    const supabase = await createIntegrationClient();
    const completedDate = new Date().toISOString();
    const durationMs =
      new Date(completedDate).getTime() - new Date(input.startedDate).getTime();
    let { error } = await supabase
      .from("integration_sync_jobs")
      .update({
        status: input.status,
        completed_date: completedDate,
        duration_ms: durationMs,
        records_retrieved: input.recordsRetrieved,
        records_processed: input.recordsProcessed,
        records_created: input.recordsCreated,
        records_updated: input.recordsUpdated,
        records_skipped: input.recordsSkipped,
        records_failed: input.recordsFailed,
        total_records_expected: input.totalRecordsExpected ?? null,
        current_page: input.currentPage ?? null,
        current_cursor: input.cursor ?? null,
        completed_successfully: input.completedSuccessfully,
        paging_complete: input.pagingComplete,
        last_successful_cursor: input.cursor ?? null,
        last_successful_sync_date: input.lastSuccessfulSyncDate ?? null,
        error_summary: input.errorSummary ?? null
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.jobId);
    if (error && isJobProgressSchemaMissing(error)) {
      const fallbackResult = await supabase
        .from("integration_sync_jobs")
        .update({
          status: input.status,
          completed_date: completedDate,
          duration_ms: durationMs,
          records_processed: input.recordsProcessed,
          records_created: input.recordsCreated,
          records_updated: input.recordsUpdated,
          records_failed: input.recordsFailed,
          last_successful_cursor: input.cursor ?? null,
          last_successful_sync_date: input.lastSuccessfulSyncDate ?? null,
          error_summary: input.errorSummary ?? null
        })
        .eq("organization_id", input.organizationId)
        .eq("id", input.jobId);
      error = fallbackResult.error;
    }
    if (error) throw error;
  }

  async updateJobProgress(input: {
    organizationId: string;
    jobId: string;
    currentPage?: number | null;
    currentCursor?: string | null;
    totalRecordsExpected?: number | null;
    recordsRetrieved?: number;
    recordsProcessed?: number;
    recordsCreated?: number;
    recordsUpdated?: number;
    recordsSkipped?: number;
    recordsFailed?: number;
    statusDetail?: string | null;
  }) {
    const supabase = await createIntegrationClient();
    const updates: Record<string, unknown> = {};
    if (typeof input.currentPage === "number" || input.currentPage === null) {
      updates.current_page = input.currentPage;
    }
    if (typeof input.currentCursor === "string" || input.currentCursor === null) {
      updates.current_cursor = input.currentCursor;
    }
    if (typeof input.totalRecordsExpected === "number" || input.totalRecordsExpected === null) {
      updates.total_records_expected = input.totalRecordsExpected;
    }
    if (typeof input.recordsRetrieved === "number") updates.records_retrieved = input.recordsRetrieved;
    if (typeof input.recordsProcessed === "number") updates.records_processed = input.recordsProcessed;
    if (typeof input.recordsCreated === "number") updates.records_created = input.recordsCreated;
    if (typeof input.recordsUpdated === "number") updates.records_updated = input.recordsUpdated;
    if (typeof input.recordsSkipped === "number") updates.records_skipped = input.recordsSkipped;
    if (typeof input.recordsFailed === "number") updates.records_failed = input.recordsFailed;
    if (typeof input.statusDetail === "string") updates.error_summary = input.statusDetail;
    if (Object.keys(updates).length === 0) return;
    let { error } = await supabase
      .from("integration_sync_jobs")
      .update(updates)
      .eq("organization_id", input.organizationId)
      .eq("id", input.jobId);
    if (error && isJobProgressSchemaMissing(error)) {
      const fallbackUpdates: Record<string, unknown> = {};
      if (typeof input.recordsProcessed === "number") fallbackUpdates.records_processed = input.recordsProcessed;
      if (typeof input.recordsCreated === "number") fallbackUpdates.records_created = input.recordsCreated;
      if (typeof input.recordsUpdated === "number") fallbackUpdates.records_updated = input.recordsUpdated;
      if (typeof input.recordsFailed === "number") fallbackUpdates.records_failed = input.recordsFailed;
      if (typeof input.currentCursor === "string" || input.currentCursor === null) {
        fallbackUpdates.last_successful_cursor = input.currentCursor;
      }
      if (typeof input.statusDetail === "string") fallbackUpdates.error_summary = input.statusDetail;
      if (Object.keys(fallbackUpdates).length > 0) {
        const retry = await supabase
          .from("integration_sync_jobs")
          .update(fallbackUpdates)
          .eq("organization_id", input.organizationId)
          .eq("id", input.jobId);
        error = retry.error;
      } else {
        error = null;
      }
    }
    if (error) throw error;
  }

  async addSyncLog(input: {
    organizationId: string;
    integrationConnectionId: string;
    jobId: string;
    entityType: string;
    sourceRecordId?: string | null;
    crmRecordId?: string | null;
    actionTaken?: string | null;
    status?: string;
    message?: string | null;
    requestPayload?: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
  }): Promise<IntegrationSyncLog> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_logs")
      .insert({
        organization_id: input.organizationId,
        integration_connection_id: input.integrationConnectionId,
        sync_job_id: input.jobId,
        entity_type: input.entityType,
        source_record_id: input.sourceRecordId ?? null,
        crm_record_id: input.crmRecordId ?? null,
        action_taken: input.actionTaken ?? null,
        status: input.status ?? "processed",
        message: input.message ?? null,
        request_payload: input.requestPayload ?? {},
        response_payload: input.responsePayload ?? {}
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as IntegrationSyncLog;
  }

  async enqueueError(input: {
    organizationId: string;
    integrationConnectionId: string;
    jobId?: string | null;
    entityType: string;
    sourceRecordId?: string | null;
    payload: Record<string, unknown>;
    errorMessage: string;
    retryCount?: number;
    status?: string;
    nextRetryDate?: string | null;
  }) {
    const supabase = await createIntegrationClient();
    const { error } = await supabase.from("integration_error_queue").insert({
      organization_id: input.organizationId,
      integration_connection_id: input.integrationConnectionId,
      sync_job_id: input.jobId ?? null,
      entity_type: input.entityType,
      source_record_id: input.sourceRecordId ?? null,
      payload_json: input.payload,
      error_message: input.errorMessage,
      retry_count: input.retryCount ?? 0,
      status: input.status ?? "open",
      next_retry_date: input.nextRetryDate ?? null
    });
    if (error) throw error;
  }

  async listJobs(organizationId: string, integrationConnectionId: string): Promise<IntegrationSyncJob[]> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_jobs")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("integration_connection_id", integrationConnectionId)
      .order("started_date", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as IntegrationSyncJob[];
  }

  async getJob(organizationId: string, jobId: string): Promise<IntegrationSyncJob | null> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_jobs")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    return (data as IntegrationSyncJob | null) ?? null;
  }

  async listJobLogs(organizationId: string, jobId: string): Promise<IntegrationSyncLog[]> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_logs")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("sync_job_id", jobId)
      .order("logged_date", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as IntegrationSyncLog[];
  }

  async listErrors(
    organizationId: string,
    integrationConnectionId: string
  ): Promise<IntegrationErrorQueueItem[]> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_error_queue")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("integration_connection_id", integrationConnectionId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as IntegrationErrorQueueItem[];
  }
}
