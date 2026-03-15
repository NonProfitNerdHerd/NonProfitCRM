import { createIntegrationClient } from "@/lib/integrations/db";
import {
  IntegrationErrorQueueItem,
  IntegrationSyncJob,
  IntegrationSyncLog
} from "@/lib/integrations/types";

export class IntegrationLogService {
  async createJob(input: {
    organizationId: string;
    integrationConnectionId: string;
    jobType: string;
    syncScope: string;
    triggeredBy: string;
    triggeredByType?: string;
  }): Promise<IntegrationSyncJob> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
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
    if (error) throw error;
    return data as IntegrationSyncJob;
  }

  async completeJob(input: {
    organizationId: string;
    jobId: string;
    status: "completed" | "failed" | "completed_with_errors";
    recordsProcessed: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    cursor?: string | null;
    lastSuccessfulSyncDate?: string | null;
    errorSummary?: string | null;
    startedDate: string;
  }) {
    const supabase = await createIntegrationClient();
    const completedDate = new Date().toISOString();
    const durationMs =
      new Date(completedDate).getTime() - new Date(input.startedDate).getTime();
    const { error } = await supabase
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
