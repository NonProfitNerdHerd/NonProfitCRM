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

export type PlatformDashboardCountRow = {
  key: string;
  count: number;
};

export type PlatformDashboardRollup = {
  tenantStats: {
    donors: number;
    contacts: number;
    donorOrganizations: number;
    organizations: number;
    activeCampaigns: number;
    totalUsers: number;
    roleCounts: PlatformDashboardCountRow[];
    donationTrend: Array<{ label: string; amount: number }>;
  };
  tenantConfiguration: {
    totalTenants: number;
    backupTierAssignedCount: number;
    backupTierUnassignedCount: number;
    statusCounts: PlatformDashboardCountRow[];
    planCounts: PlatformDashboardCountRow[];
    onboardingStageCounts: PlatformDashboardCountRow[];
    configuredModuleCounts: PlatformDashboardCountRow[];
  };
  backupStatus: {
    tenantsWithBackupMetadata: number;
    tenantsWithoutBackupMetadata: number;
    staleBackups: number;
    backupDueSoon: number;
    statusCounts: PlatformDashboardCountRow[];
  };
  restoreRequestWorkflow: {
    totalRequests: number;
    statusCounts: PlatformDashboardCountRow[];
  };
  snapshotHistory: {
    totalSnapshots: number;
    expiringSnapshots7d: number;
    statusCounts: PlatformDashboardCountRow[];
    typeCounts: PlatformDashboardCountRow[];
  };
  restoreHistory: {
    totalRestores: number;
    outcomeCounts: PlatformDashboardCountRow[];
    targetCounts: PlatformDashboardCountRow[];
  };
  provisioningAndEntitlements: {
    totalProvisioningRuns: number;
    provisioningStatusCounts: PlatformDashboardCountRow[];
    enabledEntitlementCount: number;
    tenantsWithEnabledEntitlements: number;
    moduleCounts: PlatformDashboardCountRow[];
  };
};

const EMPTY_PLATFORM_DASHBOARD_ROLLUP: PlatformDashboardRollup = {
  tenantStats: {
    donors: 0,
    contacts: 0,
    donorOrganizations: 0,
    organizations: 0,
    activeCampaigns: 0,
    totalUsers: 0,
    roleCounts: [],
    donationTrend: []
  },
  tenantConfiguration: {
    totalTenants: 0,
    backupTierAssignedCount: 0,
    backupTierUnassignedCount: 0,
    statusCounts: [],
    planCounts: [],
    onboardingStageCounts: [],
    configuredModuleCounts: []
  },
  backupStatus: {
    tenantsWithBackupMetadata: 0,
    tenantsWithoutBackupMetadata: 0,
    staleBackups: 0,
    backupDueSoon: 0,
    statusCounts: []
  },
  restoreRequestWorkflow: {
    totalRequests: 0,
    statusCounts: []
  },
  snapshotHistory: {
    totalSnapshots: 0,
    expiringSnapshots7d: 0,
    statusCounts: [],
    typeCounts: []
  },
  restoreHistory: {
    totalRestores: 0,
    outcomeCounts: [],
    targetCounts: []
  },
  provisioningAndEntitlements: {
    totalProvisioningRuns: 0,
    provisioningStatusCounts: [],
    enabledEntitlementCount: 0,
    tenantsWithEnabledEntitlements: 0,
    moduleCounts: []
  }
};

function cloneEmptyPlatformDashboardRollup(): PlatformDashboardRollup {
  return JSON.parse(JSON.stringify(EMPTY_PLATFORM_DASHBOARD_ROLLUP)) as PlatformDashboardRollup;
}

function generateTemporaryPassword() {
  return `Tmp!${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function displayNameFromNameParts(input: {
  displayName?: string;
  firstName: string;
  lastName: string;
}) {
  const explicit = toText(input.displayName);
  if (explicit) return explicit;
  return `${toText(input.firstName)} ${toText(input.lastName)}`.trim();
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

  const tenantRes = await supabase
    .from("tenants")
    .select("*, tenant_backup_tiers(*)")
    .eq("id", tenantId)
    .single();

  const [metadataRes, snapshotsRes, restoreHistoryRes, provisioningRes, entitlementsRes, tiersRes, statsRes] =
    await Promise.all([
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
  const stats = statsRes.error
    ? {}
    : ((statsRes.data ?? {}) as Record<string, unknown>);

  return {
    tenant: tenantRes.data,
    backupMetadata: metadataRes.data,
    snapshots: snapshotsRes.data ?? [],
    restoreHistory: restoreHistoryRes.data ?? [],
    provisioningRuns: provisioningRes.data ?? [],
    entitlements: entitlementsRes.data ?? [],
    backupTiers: tiersRes.data ?? [],
    stats
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

export async function getPlatformDashboardRollup(): Promise<PlatformDashboardRollup> {
  await requirePlatformAccess();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_get_dashboard_rollup");
  if (error) {
    const fallback = await buildPlatformDashboardRollupFallback(supabase).catch(() => null);
    if (fallback) return fallback;
    throw new Error(error.message);
  }
  return ((data as PlatformDashboardRollup | null) ?? EMPTY_PLATFORM_DASHBOARD_ROLLUP);
}

async function buildPlatformDashboardRollupFallback(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<PlatformDashboardRollup> {
  const [tenantsRes, restoreRes, backupMetaRes] = await Promise.all([
    supabase.from("tenants").select("id,status,backup_tier_id"),
    supabase.from("tenant_restore_requests").select("status"),
    supabase.from("tenant_backup_metadata").select("tenant_id,last_backup_at,last_backup_status")
  ]);
  if (tenantsRes.error) throw new Error(tenantsRes.error.message);
  if (restoreRes.error) throw new Error(restoreRes.error.message);
  if (backupMetaRes.error) throw new Error(backupMetaRes.error.message);

  const tenants = (tenantsRes.data ?? []) as Array<Record<string, unknown>>;
  const backupMetadata = (backupMetaRes.data ?? []) as Array<Record<string, unknown>>;
  const restoreRequests = (restoreRes.data ?? []) as Array<Record<string, unknown>>;

  const statusMap = new Map<string, number>();
  let backupTierAssignedCount = 0;
  for (const row of tenants) {
    const status = toText(row.status) || "unknown";
    statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
    if (toText(row.backup_tier_id)) backupTierAssignedCount += 1;
  }

  const restoreStatusMap = new Map<string, number>();
  for (const row of restoreRequests) {
    const status = toText(row.status) || "unknown";
    restoreStatusMap.set(status, (restoreStatusMap.get(status) ?? 0) + 1);
  }

  const backupStatusMap = new Map<string, number>();
  const now = Date.now();
  const staleThreshold = now - 1000 * 60 * 60 * 48;
  let staleBackups = 0;
  for (const row of backupMetadata) {
    const backupStatus = toText(row.last_backup_status) || "unknown";
    backupStatusMap.set(backupStatus, (backupStatusMap.get(backupStatus) ?? 0) + 1);
    const timestamp = Date.parse(toText(row.last_backup_at));
    if (Number.isNaN(timestamp) || timestamp < staleThreshold) staleBackups += 1;
  }

  const rollup = cloneEmptyPlatformDashboardRollup();
  rollup.tenantConfiguration.totalTenants = tenants.length;
  rollup.tenantConfiguration.backupTierAssignedCount = backupTierAssignedCount;
  rollup.tenantConfiguration.backupTierUnassignedCount = Math.max(
    tenants.length - backupTierAssignedCount,
    0
  );
  rollup.tenantConfiguration.statusCounts = Array.from(statusMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  rollup.backupStatus.tenantsWithBackupMetadata = backupMetadata.length;
  rollup.backupStatus.tenantsWithoutBackupMetadata = Math.max(tenants.length - backupMetadata.length, 0);
  rollup.backupStatus.staleBackups = staleBackups;
  rollup.backupStatus.statusCounts = Array.from(backupStatusMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  rollup.restoreRequestWorkflow.totalRequests = restoreRequests.length;
  rollup.restoreRequestWorkflow.statusCounts = Array.from(restoreStatusMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return rollup;
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

export type PlatformAdminManagedUser = {
  user_id: string;
  is_active: boolean;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  username: string;
  roles: Array<{ key: string; name: string }>;
};

const PLATFORM_ROLE_OPTIONS: Array<{ key: PlatformRoleKey; name: string; description: string }> = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Full platform access including roles, provisioning, and recovery actions."
  },
  {
    key: "build_team_admin",
    name: "Build Team Admin",
    description: "Manage platform configuration, users, and operational tooling."
  },
  {
    key: "support_admin",
    name: "Support Admin",
    description: "Support-focused platform access for restore and tenant issue resolution."
  },
  {
    key: "billing_admin",
    name: "Billing Admin",
    description: "Manage plan and billing-tier related platform administration tasks."
  },
  {
    key: "internal_auditor",
    name: "Internal Auditor",
    description: "Read-only oversight access to platform actions and audit history."
  },
  {
    key: "implementation_specialist",
    name: "Implementation Specialist",
    description: "Tenant implementation and onboarding access for rollout workflows."
  }
];

function roleNameForPlatformKey(roleKey: string) {
  const normalized = toText(roleKey).toLowerCase();
  const exact = PLATFORM_ROLE_OPTIONS.find((entry) => entry.key === normalized);
  if (exact) return exact.name;
  if (!normalized) return "Unknown";
  return normalized
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function normalizePlatformRoleKeys(inputKeys: string[]) {
  const allowed = new Set(PLATFORM_ROLE_OPTIONS.map((entry) => entry.key));
  return Array.from(
    new Set(
      inputKeys
        .map((key) => toText(key).toLowerCase())
        .filter((key): key is PlatformRoleKey => Boolean(key) && allowed.has(key as PlatformRoleKey))
    )
  );
}

export async function listPlatformAdminUsersData() {
  const context = await requirePlatformAccess();
  const canManageUsers = context.roles.some((role) =>
    ["super_admin", "build_team_admin"].includes(role)
  );
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("platform_list_admin_users");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Record<string, unknown>>;

  const grouped = new Map<string, PlatformAdminManagedUser>();
  for (const row of rows) {
    const userId = toText(row.user_id);
    if (!userId) continue;
    const existing = grouped.get(userId) ?? {
      user_id: userId,
      is_active: true,
      first_name: toText(row.first_name),
      last_name: toText(row.last_name),
      display_name: toText(row.display_name),
      email: toText(row.email),
      username: toText(row.username),
      roles: []
    };
    existing.is_active = Boolean(row.membership_is_active ?? row.profile_is_active ?? true);
    const roleKey = toText(row.role).toLowerCase();
    if (roleKey) {
      const roleName = roleNameForPlatformKey(roleKey);
      if (!existing.roles.some((role) => role.key === roleKey)) {
        existing.roles.push({ key: roleKey, name: roleName });
      }
    }
    grouped.set(userId, existing);
  }

  return {
    users: Array.from(grouped.values()).sort((a, b) =>
      (a.display_name || `${a.first_name} ${a.last_name}`.trim() || a.email).localeCompare(
        b.display_name || `${b.first_name} ${b.last_name}`.trim() || b.email
      )
    ),
    roles: PLATFORM_ROLE_OPTIONS,
    canManageUsers
  };
}

export async function createPlatformAdminUser(input: {
  firstName: string;
  lastName: string;
  displayName?: string;
  email: string;
  username?: string;
  isActive: boolean;
  roleKeys: string[];
}) {
  const context = await requirePlatformAccess(["super_admin", "build_team_admin"]);
  const supabase = await createClient();
  const normalizedEmail = toText(input.email).toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required.");
  const validRoleKeys = normalizePlatformRoleKeys(input.roleKeys);
  if (validRoleKeys.length === 0) {
    throw new Error("At least one platform role is required.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const displayName = displayNameFromNameParts({
    displayName: input.displayName,
    firstName: input.firstName,
    lastName: input.lastName
  });

  const { data: createdUserId, error: createError } = await supabase.rpc("platform_create_auth_user", {
    user_email: normalizedEmail,
    user_password: temporaryPassword,
    user_metadata: { display_name: displayName }
  });
  if (createError) throw new Error(createError.message);
  const userId = toText(createdUserId);
  if (!userId) {
    throw new Error("Unable to provision authentication user.");
  }

  const { error: profileError } = await supabase.rpc("platform_upsert_user_profile", {
    target_user_id: userId,
    first_name: toText(input.firstName),
    last_name: toText(input.lastName),
    display_name: displayName,
    email: normalizedEmail,
    username: toText(input.username) || null,
    is_active: Boolean(input.isActive),
    must_change_password: true
  });
  if (profileError) throw new Error(profileError.message);

  const { error: roleError } = await supabase.from("platform_admin_memberships").upsert(
    validRoleKeys.map((roleKey) => ({
      user_id: userId,
      role: roleKey,
      is_active: Boolean(input.isActive),
      created_by: context.userId
    })),
    { onConflict: "user_id,role" }
  );
  if (roleError) throw new Error(roleError.message);

  await logPlatformEvent({
    actionType: "platform_admin_user_created",
    targetEntityType: "platform_admin_memberships",
    targetEntityId: userId,
    metadata: {
      roleKeys: validRoleKeys,
      email: normalizedEmail
    }
  });

  return { userId, temporaryPassword };
}

export async function updatePlatformAdminUser(input: {
  userId: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  email: string;
  username?: string;
  isActive: boolean;
  roleKeys: string[];
}) {
  const context = await requirePlatformAccess(["super_admin", "build_team_admin"]);
  const supabase = await createClient();
  const validRoleKeys = normalizePlatformRoleKeys(input.roleKeys);
  if (validRoleKeys.length === 0) {
    throw new Error("At least one platform role is required.");
  }

  const displayName = displayNameFromNameParts({
    displayName: input.displayName,
    firstName: input.firstName,
    lastName: input.lastName
  });
  const normalizedEmail = toText(input.email).toLowerCase();

  const { error: profileError } = await supabase.rpc("platform_upsert_user_profile", {
    target_user_id: toText(input.userId),
    first_name: toText(input.firstName),
    last_name: toText(input.lastName),
    display_name: displayName,
    email: normalizedEmail,
    username: toText(input.username) || null,
    is_active: Boolean(input.isActive),
    must_change_password: null
  });
  if (profileError) throw new Error(profileError.message);

  const userId = toText(input.userId);
  const { error: deactivateError } = await supabase
    .from("platform_admin_memberships")
    .update({ is_active: false })
    .eq("user_id", userId);
  if (deactivateError) throw new Error(deactivateError.message);

  const { error: roleError } = await supabase.from("platform_admin_memberships").upsert(
    validRoleKeys.map((roleKey) => ({
      user_id: userId,
      role: roleKey,
      is_active: Boolean(input.isActive),
      created_by: context.userId
    })),
    { onConflict: "user_id,role" }
  );
  if (roleError) throw new Error(roleError.message);

  await logPlatformEvent({
    actionType: "platform_admin_user_updated",
    targetEntityType: "platform_admin_memberships",
    targetEntityId: userId,
    metadata: {
      roleKeys: validRoleKeys,
      email: normalizedEmail,
      isActive: Boolean(input.isActive)
    }
  });
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
