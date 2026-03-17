import { createClient } from "@/lib/supabase/server";
import {
  type PlatformRoleKey,
  PlatformAccessError,
  requirePlatformAccess
} from "@/lib/platform/auth";
import { getTenantBackupExecutionProvider } from "@/lib/platform/backup-executor";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function splitCsv(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

async function logPlatformEvent(input: {
  actionType: string;
  targetEntityType: string;
  targetEntityId?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  await supabase.rpc("log_platform_audit_event", {
    action_type: input.actionType,
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId ?? null,
    tenant_id: input.tenantId ?? null,
    metadata: input.metadata ?? {}
  });
}

export async function listBackupTiers() {
  await requirePlatformAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenant_backup_tiers")
    .select("*")
    .order("is_custom", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listTenants(input?: {
  q?: string;
  status?: string;
  plan?: string;
  onboardingStage?: string;
  backupTierId?: string;
  sortBy?: "created_at" | "organization_name" | "last_activity_at";
  sortDir?: "asc" | "desc";
}) {
  await requirePlatformAccess();
  const supabase = await createClient();
  let query = supabase
    .from("tenants")
    .select(
      "*, tenant_backup_tiers(id,key,name,backup_frequency,retention_days), tenant_backup_metadata(last_backup_at,last_backup_status,last_restore_at,next_backup_due_at)"
    );

  const q = toText(input?.q);
  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `organization_name.ilike.${like},slug.ilike.${like},primary_contact_name.ilike.${like},primary_contact_email.ilike.${like}`
    );
  }
  if (toText(input?.status)) query = query.eq("status", toText(input?.status));
  if (toText(input?.plan)) query = query.eq("plan_package", toText(input?.plan));
  if (toText(input?.onboardingStage)) {
    query = query.eq("onboarding_stage", toText(input?.onboardingStage));
  }
  if (toText(input?.backupTierId)) query = query.eq("backup_tier_id", toText(input?.backupTierId));

  const sortBy = input?.sortBy ?? "created_at";
  const sortDir = input?.sortDir ?? "desc";
  query = query.order(sortBy, { ascending: sortDir === "asc" });

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getTenantDetail(tenantId: string) {
  await requirePlatformAccess();
  const supabase = await createClient();

  const [
    tenantRes,
    metadataRes,
    snapshotsRes,
    restoreHistoryRes,
    provisioningRes,
    entitlementsRes,
    tiersRes,
    statsRes
  ] =
    await Promise.all([
      supabase
        .from("tenants")
        .select("*, tenant_backup_tiers(*)")
        .eq("id", tenantId)
        .single(),
      supabase.from("tenant_backup_metadata").select("*").eq("tenant_id", tenantId).maybeSingle(),
      supabase
        .from("tenant_backup_snapshots")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("captured_at", { ascending: false })
        .limit(100),
      supabase
        .from("tenant_restore_history")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("tenant_provisioning_runs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("tenant_module_entitlements")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("module_key", { ascending: true }),
      supabase.from("tenant_backup_tiers").select("*").order("name", { ascending: true }),
      supabase.rpc("platform_get_tenant_stats", { input_tenant_id: tenantId })
    ]);

  if (tenantRes.error) throw new Error(tenantRes.error.message);
  if (metadataRes.error) throw new Error(metadataRes.error.message);
  if (snapshotsRes.error) throw new Error(snapshotsRes.error.message);
  if (restoreHistoryRes.error) throw new Error(restoreHistoryRes.error.message);
  if (provisioningRes.error) throw new Error(provisioningRes.error.message);
  if (entitlementsRes.error) throw new Error(entitlementsRes.error.message);
  if (tiersRes.error) throw new Error(tiersRes.error.message);
  if (statsRes.error) throw new Error(statsRes.error.message);

  return {
    tenant: tenantRes.data,
    backupMetadata: metadataRes.data,
    snapshots: snapshotsRes.data ?? [],
    restoreHistory: restoreHistoryRes.data ?? [],
    provisioningRuns: provisioningRes.data ?? [],
    entitlements: entitlementsRes.data ?? [],
    backupTiers: tiersRes.data ?? [],
    stats: (statsRes.data ?? {}) as Record<string, unknown>
  };
}

export async function getPlatformSummary() {
  await requirePlatformAccess();
  const supabase = await createClient();
  const [tenantsRes, restoreRes, backupMetaRes] = await Promise.all([
    supabase.from("tenants").select("id,status,last_activity_at,backup_tier_id"),
    supabase
      .from("tenant_restore_requests")
      .select("id,status,requested_at")
      .in("status", ["requested", "approved", "in_progress"]),
    supabase.from("tenant_backup_metadata").select("tenant_id,last_backup_at,last_backup_status")
  ]);
  if (tenantsRes.error) throw new Error(tenantsRes.error.message);
  if (restoreRes.error) throw new Error(restoreRes.error.message);
  if (backupMetaRes.error) throw new Error(backupMetaRes.error.message);

  const tenants = tenantsRes.data ?? [];
  const backupMetadata = backupMetaRes.data ?? [];
  const now = Date.now();
  const staleThreshold = now - 1000 * 60 * 60 * 48;
  const staleBackups = backupMetadata.filter((row) => {
    const timestamp = Date.parse(String(row.last_backup_at ?? ""));
    return Number.isNaN(timestamp) || timestamp < staleThreshold;
  }).length;

  return {
    totalTenants: tenants.length,
    activeTenants: tenants.filter((row) => row.status === "active").length,
    draftTenants: tenants.filter((row) => row.status === "draft").length,
    suspendedTenants: tenants.filter((row) => row.status === "suspended").length,
    staleBackups,
    openRestoreRequests: (restoreRes.data ?? []).length
  };
}

export async function createTenantProvisioning(input: {
  organizationName: string;
  slug: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  planPackage?: string;
  enabledModulesCsv?: string;
  onboardingStage?: string;
  backupTierId?: string;
  firstTenantAdminEmail?: string;
  firstTenantAdminUserId?: string;
  saveMode?: "draft" | "active";
  appliedTemplate?: string;
  branding?: Record<string, unknown>;
  internalNotes?: string;
}) {
  await requirePlatformAccess([
    "super_admin",
    "build_team_admin",
    "implementation_specialist"
  ]);
  const supabase = await createClient();

  const saveMode = input.saveMode ?? "draft";
  const modules = splitCsv(
    input.enabledModulesCsv ??
      "contacts,financial,projects,memberships,reports,import_center,volunteer_coordination"
  );
  const { data: rpcData, error: rpcError } = await supabase.rpc("platform_provision_tenant", {
    input_organization_name: toText(input.organizationName),
    input_slug: toText(input.slug),
    input_primary_contact_name: toText(input.primaryContactName) || null,
    input_primary_contact_email: toText(input.primaryContactEmail) || null,
    input_primary_contact_phone: toText(input.primaryContactPhone) || null,
    input_plan_package: toText(input.planPackage) || "standard",
    input_enabled_modules: modules,
    input_onboarding_stage: toText(input.onboardingStage) || "new",
    input_backup_tier_id: toText(input.backupTierId) || null,
    input_first_tenant_admin_user_id: toText(input.firstTenantAdminUserId) || null,
    input_first_tenant_admin_email: toText(input.firstTenantAdminEmail) || null,
    input_save_mode: saveMode,
    input_applied_template: toText(input.appliedTemplate) || null,
    input_branding: input.branding ?? {},
    input_internal_notes: toText(input.internalNotes) || null
  });

  if (rpcError) {
    const details = [rpcError.message, rpcError.details, rpcError.hint].filter(Boolean).join(" ").toLowerCase();
    if (rpcError.code === "23505" || details.includes("slug")) {
      const requestedSlug = toText(input.slug).toLowerCase();
      const { data: existingTenant } = await supabase
        .from("tenants")
        .select("id,slug,organization_name,status")
        .eq("slug", requestedSlug)
        .limit(1)
        .maybeSingle();
      if (existingTenant?.id) {
        throw new Error(
          `Tenant slug already exists for "${toText(existingTenant.organization_name)}". Open: /platform/admin/tenants/${toText(existingTenant.id)}`
        );
      }
      throw new Error(
        "Tenant slug already exists. If it does not appear in Tenant Registry yet, retry once to recover the reserved slug, or choose a different slug (for example add -2)."
      );
    }
    if (details.includes("platform_provision_tenant")) {
      throw new Error(
        "Tenant provisioning function is not installed in this environment. Apply migration 202603182355 and retry."
      );
    }
    throw new Error(rpcError.message);
  }

  const resultRow = Array.isArray(rpcData)
    ? (rpcData[0] as Record<string, unknown> | undefined)
    : (rpcData as Record<string, unknown> | null);
  const tenantId = toText(resultRow?.tenant_id);
  const provisioningRunId = toText(resultRow?.provisioning_run_id);
  if (!tenantId) {
    throw new Error("Tenant provisioning did not return a tenant id.");
  }

  const [{ data: tenant, error: tenantError }, { data: provisioningRun, error: provisioningError }] =
    await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).single(),
      provisioningRunId
        ? supabase.from("tenant_provisioning_runs").select("*").eq("id", provisioningRunId).single()
        : Promise.resolve({ data: null, error: null })
    ]);
  if (tenantError) throw new Error(tenantError.message);
  if (provisioningError) throw new Error(provisioningError.message);

  return {
    tenant,
    provisioningRun
  };
}

export async function updateTenantConfiguration(
  tenantId: string,
  input: {
    status?: string;
    planPackage?: string;
    onboardingStage?: string;
    backupTierId?: string | null;
    primaryContactName?: string | null;
    primaryContactEmail?: string | null;
    primaryContactPhone?: string | null;
    internalNotes?: string | null;
    enabledModules?: string[];
  }
) {
  await requirePlatformAccess([
    "super_admin",
    "build_team_admin",
    "support_admin",
    "implementation_specialist",
    "billing_admin"
  ]);
  const supabase = await createClient();

  const payload: Record<string, unknown> = {};
  if (input.status !== undefined) payload.status = toText(input.status);
  if (input.planPackage !== undefined) payload.plan_package = toText(input.planPackage);
  if (input.onboardingStage !== undefined) payload.onboarding_stage = toText(input.onboardingStage);
  if (input.backupTierId !== undefined) payload.backup_tier_id = toText(input.backupTierId) || null;
  if (input.primaryContactName !== undefined) {
    payload.primary_contact_name = toText(input.primaryContactName) || null;
  }
  if (input.primaryContactEmail !== undefined) {
    payload.primary_contact_email = toText(input.primaryContactEmail) || null;
  }
  if (input.primaryContactPhone !== undefined) {
    payload.primary_contact_phone = toText(input.primaryContactPhone) || null;
  }
  if (input.internalNotes !== undefined) payload.internal_notes = toText(input.internalNotes) || null;
  if (input.enabledModules !== undefined) {
    payload.enabled_modules = input.enabledModules.map((entry) => toText(entry)).filter(Boolean);
  }

  const { data, error } = await supabase
    .from("tenants")
    .update(payload)
    .eq("id", tenantId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (input.enabledModules) {
    const moduleRows = input.enabledModules.map((moduleKey) => ({
      tenant_id: tenantId,
      module_key: moduleKey,
      is_enabled: true,
      source: "manual"
    }));
    await supabase.from("tenant_module_entitlements").upsert(moduleRows, {
      onConflict: "tenant_id,module_key"
    });
  }

  await logPlatformEvent({
    actionType: "tenant_configuration_updated",
    targetEntityType: "tenants",
    targetEntityId: tenantId,
    tenantId,
    metadata: payload
  });

  return data;
}

export async function listRestoreRequests(input?: { tenantId?: string; status?: string }) {
  await requirePlatformAccess();
  const supabase = await createClient();
  let query = supabase
    .from("tenant_restore_requests")
    .select("*, tenants(id,organization_name,slug), tenant_backup_snapshots(snapshot_reference,captured_at)")
    .order("requested_at", { ascending: false })
    .limit(200);

  if (toText(input?.tenantId)) query = query.eq("tenant_id", toText(input?.tenantId));
  if (toText(input?.status)) query = query.eq("status", toText(input?.status));

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRestoreRequest(input: {
  tenantId: string;
  backupSnapshotId?: string;
  backupPointInTime?: string;
  reason: string;
  restoreTarget: "production" | "staging_tenant" | "staging_workspace";
  stagingTenantId?: string | null;
  riskLevel?: "low" | "medium" | "high" | "critical";
}) {
  const context = await requirePlatformAccess(["super_admin", "build_team_admin", "support_admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_request_tenant_restore", {
    input_tenant_id: input.tenantId,
    input_backup_snapshot_id: toText(input.backupSnapshotId) || null,
    input_reason: toText(input.reason),
    input_restore_target: input.restoreTarget,
    input_staging_tenant_id: toText(input.stagingTenantId) || null,
    input_backup_point_in_time: toText(input.backupPointInTime) || null,
    input_risk_level: input.riskLevel ?? "medium"
  });
  if (error) throw new Error(error.message);

  const executionResult = await getTenantBackupExecutionProvider().restoreTenantSnapshot({
    tenantId: input.tenantId,
    snapshotReference: toText(input.backupSnapshotId) || undefined,
    backupPointInTime: toText(input.backupPointInTime) || undefined,
    target: input.restoreTarget,
    stagingTenantId: toText(input.stagingTenantId) || null,
    initiatedBy: context.userId,
    reason: input.reason
  });

  await supabase
    .from("tenant_restore_requests")
    .update({
      precheck_summary: {
        provider: "stub",
        executionId: executionResult.executionId,
        message: executionResult.message
      }
    })
    .eq("id", String(data));

  return {
    requestId: String(data),
    executionResult
  };
}

export async function createTenantSnapshot(input: { tenantId: string; reason?: string }) {
  const context = await requirePlatformAccess(["super_admin", "build_team_admin", "support_admin"]);
  const supabase = await createClient();
  const snapshotResult = await getTenantBackupExecutionProvider().createTenantSnapshot({
    tenantId: input.tenantId,
    initiatedBy: context.userId,
    reason: input.reason
  });

  const { data, error } = await supabase
    .from("tenant_backup_snapshots")
    .insert({
      tenant_id: input.tenantId,
      snapshot_reference: snapshotResult.snapshotReference,
      snapshot_type: snapshotResult.snapshotType,
      captured_at: snapshotResult.capturedAt,
      expires_at: snapshotResult.expiresAt,
      storage_path: snapshotResult.storagePath,
      metadata: snapshotResult.metadata ?? {},
      created_by: context.userId,
      status: "ready"
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logPlatformEvent({
    actionType: "tenant_snapshot_created",
    targetEntityType: "tenant_backup_snapshots",
    targetEntityId: toText(data.id),
    tenantId: input.tenantId,
    metadata: {
      snapshotReference: snapshotResult.snapshotReference,
      reason: toText(input.reason) || null
    }
  });

  return data;
}

export async function upsertBackupTier(input: {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  backupFrequency: string;
  retentionDays: number;
  supportsPointInTimeRestore?: boolean;
  supportsStagingRestore?: boolean;
  supportsCustomRestoreWindow?: boolean;
  isCustom?: boolean;
  isActive?: boolean;
}) {
  await requirePlatformAccess(["super_admin", "build_team_admin", "billing_admin"]);
  const supabase = await createClient();
  const payload = {
    key: toText(input.key),
    name: toText(input.name),
    description: toText(input.description) || null,
    backup_frequency: toText(input.backupFrequency),
    retention_days: Number(input.retentionDays),
    supports_point_in_time_restore: Boolean(input.supportsPointInTimeRestore),
    supports_staging_restore: input.supportsStagingRestore ?? true,
    supports_custom_restore_window: Boolean(input.supportsCustomRestoreWindow),
    is_custom: Boolean(input.isCustom),
    is_active: input.isActive ?? true
  };

  if (toText(input.id)) {
    const { data, error } = await supabase
      .from("tenant_backup_tiers")
      .update(payload)
      .eq("id", toText(input.id))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from("tenant_backup_tiers")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listPlatformAuditEvents(input?: { tenantId?: string; limit?: number }) {
  await requirePlatformAccess();
  const supabase = await createClient();
  const limit = Math.min(Math.max(Number(input?.limit ?? 200), 1), 500);
  let query = supabase
    .from("platform_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (toText(input?.tenantId)) query = query.eq("tenant_id", toText(input?.tenantId));

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createImpersonationSession(input: {
  tenantId: string;
  reason: string;
  impersonatedUserId?: string;
}) {
  const context = await requirePlatformAccess(["super_admin", "build_team_admin", "support_admin"]);
  const supabase = await createClient();
  const topRole = context.roles[0] as PlatformRoleKey;
  const { data, error } = await supabase
    .from("platform_impersonation_sessions")
    .insert({
      actor_user_id: context.userId,
      actor_role: topRole,
      tenant_id: input.tenantId,
      impersonated_user_id: toText(input.impersonatedUserId) || null,
      reason: toText(input.reason),
      banner_message: "Platform admin impersonation is active.",
      metadata: {
        startedBy: context.userId
      }
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logPlatformEvent({
    actionType: "tenant_impersonation_started",
    targetEntityType: "platform_impersonation_sessions",
    targetEntityId: toText(data.id),
    tenantId: input.tenantId,
    metadata: {
      impersonatedUserId: toText(input.impersonatedUserId) || null
    }
  });
  return data;
}

export function toPlatformError(error: unknown, fallback: string) {
  if (error instanceof PlatformAccessError) {
    return {
      message: error.message,
      status: error.status
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message || fallback,
      status: 500
    };
  }
  return {
    message: fallback,
    status: 500
  };
}
