import { createIntegrationClient } from "@/lib/integrations/db";

export type IntegrationSyncModeStatus =
  | "pending_initial_sync"
  | "full_sync_in_progress"
  | "incremental_ready"
  | "incremental_sync_in_progress"
  | "failed";

export type IntegrationSyncRunMode = "auto" | "full" | "incremental";

export type IntegrationSyncState = {
  id: string;
  organization_id: string;
  integration_connection_id: string;
  sync_scope: "contacts" | "donations" | "all";
  sync_mode_status: IntegrationSyncModeStatus;
  initial_full_sync_completed: boolean;
  active_job_id: string | null;
  last_successful_full_sync_at: string | null;
  last_successful_incremental_sync_at: string | null;
  last_processed_checkpoint: string | null;
  last_error_message: string | null;
  status_message: string | null;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  records_failed: number;
  total_records_expected: number | null;
  records_remaining: number | null;
  percent_complete: number | null;
  current_page: number | null;
  current_batch: number | null;
  started_at: string | null;
  last_updated_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const IN_PROGRESS_STATUSES = new Set<IntegrationSyncModeStatus>([
  "full_sync_in_progress",
  "incremental_sync_in_progress"
]);

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isoOrNull(value: unknown) {
  const text = toText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function asState(row: Record<string, unknown>): IntegrationSyncState {
  return {
    id: toText(row.id),
    organization_id: toText(row.organization_id),
    integration_connection_id: toText(row.integration_connection_id),
    sync_scope: (toText(row.sync_scope) || "contacts") as "contacts" | "donations" | "all",
    sync_mode_status: (toText(row.sync_mode_status) || "pending_initial_sync") as IntegrationSyncModeStatus,
    initial_full_sync_completed: Boolean(row.initial_full_sync_completed),
    active_job_id: toText(row.active_job_id) || null,
    last_successful_full_sync_at: isoOrNull(row.last_successful_full_sync_at),
    last_successful_incremental_sync_at: isoOrNull(row.last_successful_incremental_sync_at),
    last_processed_checkpoint: isoOrNull(row.last_processed_checkpoint),
    last_error_message: toText(row.last_error_message) || null,
    status_message: toText(row.status_message) || null,
    records_processed: toNumber(row.records_processed, 0),
    records_created: toNumber(row.records_created, 0),
    records_updated: toNumber(row.records_updated, 0),
    records_skipped: toNumber(row.records_skipped, 0),
    records_failed: toNumber(row.records_failed, 0),
    total_records_expected:
      row.total_records_expected === null || row.total_records_expected === undefined
        ? null
        : toNumber(row.total_records_expected, 0),
    records_remaining:
      row.records_remaining === null || row.records_remaining === undefined
        ? null
        : toNumber(row.records_remaining, 0),
    percent_complete:
      row.percent_complete === null || row.percent_complete === undefined
        ? null
        : toNumber(row.percent_complete, 0),
    current_page:
      row.current_page === null || row.current_page === undefined
        ? null
        : toNumber(row.current_page, 0),
    current_batch:
      row.current_batch === null || row.current_batch === undefined
        ? null
        : toNumber(row.current_batch, 0),
    started_at: isoOrNull(row.started_at),
    last_updated_at: isoOrNull(row.last_updated_at),
    completed_at: isoOrNull(row.completed_at),
    created_at: isoOrNull(row.created_at) ?? new Date().toISOString(),
    updated_at: isoOrNull(row.updated_at) ?? new Date().toISOString()
  };
}

export class IntegrationSyncStateService {
  async getState(input: {
    organizationId: string;
    integrationConnectionId: string;
    syncScope?: "contacts" | "donations" | "all";
  }) {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_states")
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("integration_connection_id", input.integrationConnectionId)
      .eq("sync_scope", input.syncScope ?? "contacts")
      .maybeSingle();
    if (error) throw error;
    return data ? asState(data as Record<string, unknown>) : null;
  }

  async ensureState(input: {
    organizationId: string;
    integrationConnectionId: string;
    syncScope?: "contacts" | "donations" | "all";
    userId?: string;
  }) {
    const existing = await this.getState(input);
    if (existing) return existing;
    const scope = input.syncScope ?? "contacts";
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_states")
      .insert({
        organization_id: input.organizationId,
        integration_connection_id: input.integrationConnectionId,
        sync_scope: scope,
        sync_mode_status: "pending_initial_sync",
        initial_full_sync_completed: false,
        status_message: "Initial full sync has not run yet.",
        created_by: input.userId ?? null,
        updated_by: input.userId ?? null
      })
      .select("*")
      .single();
    if (error) throw error;
    return asState(data as Record<string, unknown>);
  }

  resolveRunMode(input: { state: IntegrationSyncState; requestedMode: IntegrationSyncRunMode }) {
    if (input.requestedMode === "auto") {
      return input.state.initial_full_sync_completed ? "incremental" : "full";
    }
    return input.requestedMode;
  }

  async acquireRun(input: {
    organizationId: string;
    integrationConnectionId: string;
    requestedMode: IntegrationSyncRunMode;
    syncScope?: "contacts" | "donations" | "all";
    userId?: string;
    statusMessage?: string;
  }) {
    const state = await this.ensureState(input);
    const runMode = this.resolveRunMode({ state, requestedMode: input.requestedMode });
    if (runMode === "incremental" && !state.initial_full_sync_completed) {
      throw new Error("Incremental sync is not available until the initial full sync completes successfully.");
    }
    if (IN_PROGRESS_STATUSES.has(state.sync_mode_status)) {
      const staleThresholdMs = 30 * 60 * 1000;
      const referenceTime = Date.parse(state.last_updated_at ?? state.started_at ?? "");
      const isStale = Number.isFinite(referenceTime) && Date.now() - referenceTime > staleThresholdMs;
      if (!isStale) {
        throw new Error("A sync run is already in progress for this integration.");
      }

      const supabase = await createIntegrationClient();
      await supabase
        .from("integration_sync_states")
        .update({
          sync_mode_status: "failed",
          active_job_id: null,
          last_error_message:
            "Previous sync run was marked stale after no updates for 30 minutes.",
          status_message:
            "Previous sync run was marked stale after no updates for 30 minutes.",
          completed_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
          updated_by: input.userId ?? null
        })
        .eq("organization_id", input.organizationId)
        .eq("integration_connection_id", input.integrationConnectionId)
        .eq("sync_scope", input.syncScope ?? "contacts");
    }

    const nowIso = new Date().toISOString();
    const nextMode: IntegrationSyncModeStatus =
      runMode === "full" ? "full_sync_in_progress" : "incremental_sync_in_progress";

    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_states")
      .update({
        sync_mode_status: nextMode,
        active_job_id: null,
        started_at: nowIso,
        last_updated_at: nowIso,
        completed_at: null,
        status_message:
          input.statusMessage ??
          (runMode === "full"
            ? "Initial full sync is in progress."
            : "Incremental sync is in progress."),
        last_error_message: null,
        records_processed: 0,
        records_created: 0,
        records_updated: 0,
        records_skipped: 0,
        records_failed: 0,
        total_records_expected: null,
        records_remaining: null,
        percent_complete: null,
        current_page: null,
        current_batch: null,
        updated_by: input.userId ?? null
      })
      .eq("organization_id", input.organizationId)
      .eq("integration_connection_id", input.integrationConnectionId)
      .eq("sync_scope", input.syncScope ?? "contacts")
      .select("*")
      .single();
    if (error) throw error;
    return {
      state: asState(data as Record<string, unknown>),
      runMode
    };
  }

  async attachJob(input: {
    organizationId: string;
    integrationConnectionId: string;
    syncScope?: "contacts" | "donations" | "all";
    jobId: string;
    userId?: string;
  }) {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_states")
      .update({
        active_job_id: input.jobId,
        last_updated_at: new Date().toISOString(),
        updated_by: input.userId ?? null
      })
      .eq("organization_id", input.organizationId)
      .eq("integration_connection_id", input.integrationConnectionId)
      .eq("sync_scope", input.syncScope ?? "contacts")
      .select("*")
      .single();
    if (error) throw error;
    return asState(data as Record<string, unknown>);
  }

  async updateProgress(input: {
    organizationId: string;
    integrationConnectionId: string;
    syncScope?: "contacts" | "donations" | "all";
    recordsProcessed: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsSkipped: number;
    recordsFailed: number;
    totalRecordsExpected?: number | null;
    currentPage?: number | null;
    currentBatch?: number | null;
    statusMessage?: string | null;
    userId?: string;
  }) {
    const totalExpected =
      typeof input.totalRecordsExpected === "number" && Number.isFinite(input.totalRecordsExpected)
        ? Math.max(0, Math.floor(input.totalRecordsExpected))
        : null;
    const processed = Math.max(0, Math.floor(input.recordsProcessed));
    const remaining = totalExpected === null ? null : Math.max(totalExpected - processed, 0);
    const percentComplete =
      totalExpected && totalExpected > 0
        ? Number(((processed / totalExpected) * 100).toFixed(2))
        : null;

    const supabase = await createIntegrationClient();
    const updates: Record<string, unknown> = {
      records_processed: processed,
      records_created: Math.max(0, Math.floor(input.recordsCreated)),
      records_updated: Math.max(0, Math.floor(input.recordsUpdated)),
      records_skipped: Math.max(0, Math.floor(input.recordsSkipped)),
      records_failed: Math.max(0, Math.floor(input.recordsFailed)),
      total_records_expected: totalExpected,
      records_remaining: remaining,
      percent_complete: percentComplete,
      current_page:
        typeof input.currentPage === "number" && Number.isFinite(input.currentPage)
          ? Math.max(0, Math.floor(input.currentPage))
          : null,
      current_batch:
        typeof input.currentBatch === "number" && Number.isFinite(input.currentBatch)
          ? Math.max(0, Math.floor(input.currentBatch))
          : null,
      last_updated_at: new Date().toISOString(),
      updated_by: input.userId ?? null
    };
    if (typeof input.statusMessage === "string") {
      updates.status_message = input.statusMessage;
    }

    const { data, error } = await supabase
      .from("integration_sync_states")
      .update(updates)
      .eq("organization_id", input.organizationId)
      .eq("integration_connection_id", input.integrationConnectionId)
      .eq("sync_scope", input.syncScope ?? "contacts")
      .select("*")
      .single();
    if (error) throw error;
    return asState(data as Record<string, unknown>);
  }

  async completeRun(input: {
    organizationId: string;
    integrationConnectionId: string;
    runMode: Exclude<IntegrationSyncRunMode, "auto">;
    success: boolean;
    syncScope?: "contacts" | "donations" | "all";
    checkpoint?: string | null;
    totalRecordsExpected?: number | null;
    currentPage?: number | null;
    currentBatch?: number | null;
    recordsProcessed: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsSkipped: number;
    recordsFailed: number;
    statusMessage?: string | null;
    lastErrorMessage?: string | null;
    userId?: string;
  }) {
    const existing = await this.ensureState(input);
    const nowIso = new Date().toISOString();
    const nextStatus: IntegrationSyncModeStatus = input.success ? "incremental_ready" : "failed";
    const nextCheckpoint = input.success
      ? isoOrNull(input.checkpoint) ?? existing.last_processed_checkpoint
      : existing.last_processed_checkpoint;

    const totalExpected =
      typeof input.totalRecordsExpected === "number" && Number.isFinite(input.totalRecordsExpected)
        ? Math.max(0, Math.floor(input.totalRecordsExpected))
        : null;
    const processed = Math.max(0, Math.floor(input.recordsProcessed));
    const remaining = totalExpected === null ? null : Math.max(totalExpected - processed, 0);
    const percentComplete =
      totalExpected && totalExpected > 0
        ? Number(((processed / totalExpected) * 100).toFixed(2))
        : input.success
          ? 100
          : null;

    const updates: Record<string, unknown> = {
      sync_mode_status: nextStatus,
      initial_full_sync_completed:
        input.runMode === "full" ? input.success : existing.initial_full_sync_completed,
      active_job_id: null,
      last_processed_checkpoint: nextCheckpoint,
      last_successful_full_sync_at:
        input.success && input.runMode === "full"
          ? nowIso
          : existing.last_successful_full_sync_at,
      last_successful_incremental_sync_at:
        input.success && input.runMode === "incremental"
          ? nowIso
          : existing.last_successful_incremental_sync_at,
      records_processed: processed,
      records_created: Math.max(0, Math.floor(input.recordsCreated)),
      records_updated: Math.max(0, Math.floor(input.recordsUpdated)),
      records_skipped: Math.max(0, Math.floor(input.recordsSkipped)),
      records_failed: Math.max(0, Math.floor(input.recordsFailed)),
      total_records_expected: totalExpected,
      records_remaining: remaining,
      percent_complete: percentComplete,
      current_page:
        typeof input.currentPage === "number" && Number.isFinite(input.currentPage)
          ? Math.max(0, Math.floor(input.currentPage))
          : null,
      current_batch:
        typeof input.currentBatch === "number" && Number.isFinite(input.currentBatch)
          ? Math.max(0, Math.floor(input.currentBatch))
          : null,
      status_message:
        input.statusMessage ??
        (input.success
          ? input.runMode === "full"
            ? "Initial full sync completed successfully."
            : "Incremental sync completed successfully."
          : "Sync run failed."),
      last_error_message: input.success ? null : toText(input.lastErrorMessage) || "Sync run failed.",
      completed_at: nowIso,
      last_updated_at: nowIso,
      updated_by: input.userId ?? null
    };

    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_states")
      .update(updates)
      .eq("organization_id", input.organizationId)
      .eq("integration_connection_id", input.integrationConnectionId)
      .eq("sync_scope", input.syncScope ?? "contacts")
      .select("*")
      .single();
    if (error) throw error;
    return asState(data as Record<string, unknown>);
  }

  async resetState(input: {
    organizationId: string;
    integrationConnectionId: string;
    syncScope?: "contacts" | "donations" | "all";
    userId?: string;
  }) {
    await this.ensureState(input);
    const nowIso = new Date().toISOString();
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_sync_states")
      .update({
        sync_mode_status: "pending_initial_sync",
        initial_full_sync_completed: false,
        active_job_id: null,
        last_successful_full_sync_at: null,
        last_successful_incremental_sync_at: null,
        last_processed_checkpoint: null,
        last_error_message: null,
        status_message: "Sync state reset. Initial full sync is required.",
        records_processed: 0,
        records_created: 0,
        records_updated: 0,
        records_skipped: 0,
        records_failed: 0,
        total_records_expected: null,
        records_remaining: null,
        percent_complete: null,
        current_page: null,
        current_batch: null,
        started_at: null,
        completed_at: nowIso,
        last_updated_at: nowIso,
        updated_by: input.userId ?? null
      })
      .eq("organization_id", input.organizationId)
      .eq("integration_connection_id", input.integrationConnectionId)
      .eq("sync_scope", input.syncScope ?? "contacts")
      .select("*")
      .single();
    if (error) throw error;
    return asState(data as Record<string, unknown>);
  }
}
