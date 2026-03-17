"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LineChart } from "@/components/analytics/line-chart";
import { formatCurrency } from "@/lib/utils";

type UnknownRow = Record<string, unknown>;

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roleLabel(roleKey: string) {
  const normalized = roleKey.trim().toLowerCase();
  const labels: Record<string, string> = {
    administrator: "Administrator",
    data_administrator: "Data Administrator",
    data_steward: "Data Steward",
    executive_staff: "Executive Staff",
    staff_pii: "Staff PII Access",
    staff_non_pii: "Staff Non-PII Access",
    data_entry: "Data Entry",
    volunteer: "Volunteer"
  };
  if (labels[normalized]) return labels[normalized];
  if (!normalized) return "Unknown";
  return normalized
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
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

export function TenantDetailDashboard({
  initialTenant,
  initialBackupMetadata,
  initialSnapshots,
  initialRestoreHistory,
  initialProvisioningRuns,
  initialEntitlements,
  backupTiers,
  initialStats
}: {
  initialTenant: UnknownRow;
  initialBackupMetadata: UnknownRow | null;
  initialSnapshots: UnknownRow[];
  initialRestoreHistory: UnknownRow[];
  initialProvisioningRuns: UnknownRow[];
  initialEntitlements: UnknownRow[];
  backupTiers: UnknownRow[];
  initialStats: UnknownRow;
}) {
  const tenantId = toText(initialTenant.id);
  const [tenant, setTenant] = useState(initialTenant);
  const [backupMetadata, setBackupMetadata] = useState(initialBackupMetadata);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [restoreHistory, setRestoreHistory] = useState(initialRestoreHistory);
  const [provisioningRuns] = useState(initialProvisioningRuns);
  const [entitlements, setEntitlements] = useState(initialEntitlements);
  const [stats, setStats] = useState(initialStats);
  const [activeTab, setActiveTab] = useState<
    | "stats"
    | "configuration"
    | "backup"
    | "restore_request"
    | "snapshot_history"
    | "restore_history"
    | "provisioning"
  >("stats");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    status: toText(initialTenant.status),
    planPackage: toText(initialTenant.plan_package),
    onboardingStage: toText(initialTenant.onboarding_stage),
    backupTierId: toText(initialTenant.backup_tier_id),
    primaryContactName: toText(initialTenant.primary_contact_name),
    primaryContactEmail: toText(initialTenant.primary_contact_email),
    primaryContactPhone: toText(initialTenant.primary_contact_phone),
    internalNotes: toText(initialTenant.internal_notes),
    enabledModulesCsv:
      (Array.isArray(initialTenant.enabled_modules)
        ? initialTenant.enabled_modules.map((entry) => toText(entry))
        : []
      ).join(", ") || ""
  });

  const [restoreForm, setRestoreForm] = useState({
    backupSnapshotId: toText(initialSnapshots[0]?.id),
    backupPointInTime: "",
    reason: "",
    restoreTarget: "staging_tenant" as "production" | "staging_tenant" | "staging_workspace",
    stagingTenantId: "",
    riskLevel: "medium" as "low" | "medium" | "high" | "critical"
  });

  const snapshotOptions = useMemo(
    () =>
      snapshots.map((snapshot) => ({
        id: toText(snapshot.id),
        label: `${toText(snapshot.snapshot_reference)} (${toText(snapshot.captured_at).slice(0, 19).replace("T", " ")})`
      })),
    [snapshots]
  );

  const statsSummary = useMemo(() => {
    const contactCounts =
      (stats?.contactCounts as Record<string, unknown> | undefined) ??
      ({} as Record<string, unknown>);
    const knownRoleKeys = [
      "administrator",
      "data_administrator",
      "data_steward",
      "executive_staff",
      "staff_pii",
      "staff_non_pii",
      "data_entry",
      "volunteer"
    ];
    const roleRowsRaw = Array.isArray(stats?.roleCounts)
      ? (stats.roleCounts as Array<Record<string, unknown>>)
      : [];
    const roleMap = new Map<string, number>();
    for (const row of roleRowsRaw) {
      const key = toText(row.roleKey).toLowerCase();
      if (!key) continue;
      roleMap.set(key, toNumber(row.userCount));
    }
    const orderedRoleRows = [
      ...knownRoleKeys.map((key) => ({
        roleKey: key,
        userCount: roleMap.get(key) ?? 0
      })),
      ...Array.from(roleMap.entries())
        .filter(([key]) => !knownRoleKeys.includes(key))
        .map(([roleKey, userCount]) => ({ roleKey, userCount }))
        .sort((a, b) => a.roleKey.localeCompare(b.roleKey))
    ];

    const trendOrder = [
      "last_30_days",
      "last_60_days",
      "last_90_days",
      "last_120_days",
      "last_1_year",
      "last_3_years",
      "last_5_years",
      "last_10_years"
    ];
    const trendLabelMap: Record<string, string> = {
      last_30_days: "30D",
      last_60_days: "60D",
      last_90_days: "90D",
      last_120_days: "120D",
      last_1_year: "1Y",
      last_3_years: "3Y",
      last_5_years: "5Y",
      last_10_years: "10Y"
    };
    const trendDisplayMap: Record<string, string> = {
      last_30_days: "Last 30 Days",
      last_60_days: "Last 60 Days",
      last_90_days: "Last 90 Days",
      last_120_days: "Last 120 Days",
      last_1_year: "Last 1 Year",
      last_3_years: "Last 3 Years",
      last_5_years: "Last 5 Years",
      last_10_years: "Last 10 Years"
    };
    const trendRaw = Array.isArray(stats?.donationTrend)
      ? (stats.donationTrend as Array<Record<string, unknown>>)
      : [];
    const trendMap = new Map<string, number>();
    for (const row of trendRaw) {
      const key = toText(row.label);
      if (!key) continue;
      trendMap.set(key, toNumber(row.amount));
    }
    const trendPoints = trendOrder.map((key) => ({
      label: trendLabelMap[key],
      y: trendMap.get(key) ?? 0
    }));
    const trendBreakdown = trendOrder.map((key) => ({
      key,
      label: trendDisplayMap[key],
      amount: trendMap.get(key) ?? 0
    }));

    return {
      donors: toNumber(contactCounts.donors),
      contacts: toNumber(contactCounts.contacts),
      donorOrganizations: toNumber(contactCounts.donorOrganizations),
      organizations: toNumber(contactCounts.organizations),
      totalUsers: toNumber(stats?.totalUsers),
      activeCampaigns: toNumber(stats?.activeCampaigns),
      roleRows: orderedRoleRows,
      trendPoints,
      trendBreakdown
    };
  }, [stats]);

  async function reloadDetail() {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`);
    const payload = (await response.json().catch(() => null)) as
      | {
          message?: string;
          tenant?: UnknownRow;
          backupMetadata?: UnknownRow | null;
          snapshots?: UnknownRow[];
          restoreHistory?: UnknownRow[];
          entitlements?: UnknownRow[];
          stats?: UnknownRow;
        }
      | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to reload tenant detail.");
      setLoading(false);
      return;
    }
    if (payload?.tenant) setTenant(payload.tenant);
    setBackupMetadata((payload?.backupMetadata as UnknownRow | null | undefined) ?? null);
    setSnapshots(payload?.snapshots ?? []);
    setRestoreHistory(payload?.restoreHistory ?? []);
    setEntitlements(payload?.entitlements ?? []);
    if (payload?.stats) setStats(payload.stats);
    setLoading(false);
  }

  async function saveTenantConfig(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: editForm.status,
        planPackage: editForm.planPackage,
        onboardingStage: editForm.onboardingStage,
        backupTierId: editForm.backupTierId || null,
        primaryContactName: editForm.primaryContactName || null,
        primaryContactEmail: editForm.primaryContactEmail || null,
        primaryContactPhone: editForm.primaryContactPhone || null,
        internalNotes: editForm.internalNotes || null,
        enabledModules: splitCsv(editForm.enabledModulesCsv)
      })
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to update tenant.");
      setLoading(false);
      return;
    }
    setMessage("Tenant configuration updated.");
    await reloadDetail();
  }

  async function createSnapshot() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}/snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Manual platform snapshot request" })
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to create snapshot.");
      setLoading(false);
      return;
    }
    setMessage("Tenant snapshot queued.");
    await reloadDetail();
  }

  async function submitRestoreRequest(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/platform/restore-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        backupSnapshotId: restoreForm.backupSnapshotId || undefined,
        backupPointInTime: restoreForm.backupPointInTime || undefined,
        reason: restoreForm.reason,
        restoreTarget: restoreForm.restoreTarget,
        stagingTenantId: restoreForm.stagingTenantId || undefined,
        riskLevel: restoreForm.riskLevel
      })
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to submit restore request.");
      setLoading(false);
      return;
    }
    setMessage("Restore request created and queued for review.");
    setRestoreForm((prev) => ({ ...prev, reason: "" }));
    await reloadDetail();
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: "stats", label: "Stats" },
              { key: "configuration", label: "Tenant Configuration" },
              { key: "backup", label: "Backup Status" },
              { key: "restore_request", label: "Restore Request Workflow" },
              { key: "snapshot_history", label: "Snapshot History" },
              { key: "restore_history", label: "Restore History" },
              { key: "provisioning", label: "Provisioning & Entitlements" }
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  activeTab === tab.key
                    ? "bg-emerald-100 text-emerald-900"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Button type="button" variant="secondary" onClick={() => void reloadDetail()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {activeTab === "stats" ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Donors</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {statsSummary.donors.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Contacts</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {statsSummary.contacts.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Donor Organizations</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {statsSummary.donorOrganizations.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Organizations</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {statsSummary.organizations.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Active Campaigns</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {statsSummary.activeCampaigns.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Users</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {statsSummary.totalUsers.toLocaleString()}
                </p>
              </div>
            </div>

            <LineChart
              title={`Total Raised Trend (${formatCurrency(
                statsSummary.trendPoints[statsSummary.trendPoints.length - 1]?.y ?? 0
              )} in 10Y)`}
              yAxisLabel="Amount Raised"
              xAxisLabel="Rolling Window"
              series={[
                {
                  name: "Amount Raised",
                  color: "#16A34A",
                  points: statsSummary.trendPoints
                }
              ]}
            />

            <section className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Total Raised by Time Window</p>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {statsSummary.trendBreakdown.map((entry) => (
                  <div key={entry.key} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{entry.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(entry.amount)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Users by Role</p>
              <div className="overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2">Role</th>
                      <th className="py-2 text-right">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsSummary.roleRows.map((row) => (
                      <tr key={row.roleKey} className="border-b border-slate-100">
                        <td className="py-2">{roleLabel(row.roleKey)}</td>
                        <td className="py-2 text-right">{row.userCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === "configuration" ? (
          <form className="space-y-3" onSubmit={saveTenantConfig}>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="tenant-status" className="text-xs font-semibold text-slate-700">
                  Tenant Status
                </label>
                <select
                  id="tenant-status"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={editForm.status}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="archived">archived</option>
                </select>
                <p className="text-[11px] text-slate-500">
                  Controls whether this tenant is live, paused, or archived in the platform.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="tenant-plan-package" className="text-xs font-semibold text-slate-700">
                  Plan Package
                </label>
                <Input
                  id="tenant-plan-package"
                  value={editForm.planPackage}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, planPackage: event.target.value }))}
                  placeholder="standard"
                />
                <p className="text-[11px] text-slate-500">
                  Billing/entitlement plan key used for this tenant.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="tenant-onboarding-stage" className="text-xs font-semibold text-slate-700">
                  Onboarding Stage
                </label>
                <select
                  id="tenant-onboarding-stage"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={editForm.onboardingStage}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, onboardingStage: event.target.value }))}
                >
                  {["new", "discovery", "implementation", "data_migration", "training", "go_live", "active"].map(
                    (stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    )
                  )}
                </select>
                <p className="text-[11px] text-slate-500">
                  Indicates where this tenant is in implementation and launch.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="tenant-backup-tier" className="text-xs font-semibold text-slate-700">
                  Backup Tier
                </label>
                <select
                  id="tenant-backup-tier"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={editForm.backupTierId}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, backupTierId: event.target.value }))}
                >
                  <option value="">Unassigned Backup Tier</option>
                  {backupTiers.map((tier) => (
                    <option key={toText(tier.id)} value={toText(tier.id)}>
                      {toText(tier.name)} ({toText(tier.backup_frequency)} / {toText(tier.retention_days)}d)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Sets backup frequency and retention defaults for this tenant.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="tenant-primary-contact-name" className="text-xs font-semibold text-slate-700">
                  Primary Contact Name
                </label>
                <Input
                  id="tenant-primary-contact-name"
                  value={editForm.primaryContactName}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, primaryContactName: event.target.value }))
                  }
                  placeholder="Jane Admin"
                />
                <p className="text-[11px] text-slate-500">
                  Main operational contact for platform and implementation communications.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="tenant-primary-contact-email" className="text-xs font-semibold text-slate-700">
                  Primary Contact Email
                </label>
                <Input
                  id="tenant-primary-contact-email"
                  type="email"
                  value={editForm.primaryContactEmail}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, primaryContactEmail: event.target.value }))
                  }
                  placeholder="admin@example.org"
                />
                <p className="text-[11px] text-slate-500">
                  Email used for tenant-level notices and support follow-up.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="tenant-primary-contact-phone" className="text-xs font-semibold text-slate-700">
                  Primary Contact Phone
                </label>
                <Input
                  id="tenant-primary-contact-phone"
                  value={editForm.primaryContactPhone}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, primaryContactPhone: event.target.value }))
                  }
                  placeholder="(555) 123-4567"
                />
                <p className="text-[11px] text-slate-500">
                  Optional direct line for urgent implementation or support issues.
                </p>
              </div>
              <div className="space-y-1 md:col-span-3">
                <label htmlFor="tenant-enabled-modules" className="text-xs font-semibold text-slate-700">
                  Enabled Modules (CSV)
                </label>
                <Input
                  id="tenant-enabled-modules"
                  value={editForm.enabledModulesCsv}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, enabledModulesCsv: event.target.value }))
                  }
                  placeholder="contacts,financial,projects,memberships,reports"
                />
                <p className="text-[11px] text-slate-500">
                  Comma-separated module keys that should be available to this tenant.
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="tenant-internal-notes" className="text-xs font-semibold text-slate-700">
                Internal Notes
              </label>
              <textarea
                id="tenant-internal-notes"
                className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={editForm.internalNotes}
                onChange={(event) => setEditForm((prev) => ({ ...prev, internalNotes: event.target.value }))}
                placeholder="Internal platform notes for this tenant"
              />
              <p className="text-[11px] text-slate-500">
                Staff-only notes about setup decisions, exceptions, or support context.
              </p>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Tenant Configuration"}
            </Button>
          </form>
        ) : null}

        {activeTab === "backup" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Backup Status</p>
              <Button type="button" onClick={() => void createSnapshot()} disabled={loading}>
                Create Snapshot
              </Button>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-4">
              <p>
                <span className="font-medium text-slate-700">Backup Tier:</span>{" "}
                {toText(tenant.backup_frequency) || "-"}
              </p>
              <p>
                <span className="font-medium text-slate-700">Retention:</span>{" "}
                {toText(tenant.backup_retention_days) || "-"} days
              </p>
              <p>
                <span className="font-medium text-slate-700">Last Backup:</span>{" "}
                {toText(backupMetadata?.last_backup_at) || "-"}
              </p>
              <p>
                <span className="font-medium text-slate-700">Last Restore:</span>{" "}
                {toText(backupMetadata?.last_restore_at) || "-"}
              </p>
            </div>
          </div>
        ) : null}

        {activeTab === "restore_request" ? (
          <form className="space-y-3" onSubmit={submitRestoreRequest}>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="restore-snapshot-id" className="text-xs font-semibold text-slate-700">
                  Backup Snapshot
                </label>
                <select
                  id="restore-snapshot-id"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={restoreForm.backupSnapshotId}
                  onChange={(event) =>
                    setRestoreForm((prev) => ({ ...prev, backupSnapshotId: event.target.value }))
                  }
                >
                  <option value="">Use point-in-time only</option>
                  {snapshotOptions.map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.id}>
                      {snapshot.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Choose a captured snapshot, or leave blank to restore by point-in-time.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="restore-point-in-time" className="text-xs font-semibold text-slate-700">
                  Backup Point In Time
                </label>
                <Input
                  id="restore-point-in-time"
                  type="datetime-local"
                  value={restoreForm.backupPointInTime}
                  onChange={(event) =>
                    setRestoreForm((prev) => ({ ...prev, backupPointInTime: event.target.value }))
                  }
                />
                <p className="text-[11px] text-slate-500">
                  Exact UTC timestamp to restore to when doing PITR recovery.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="restore-target" className="text-xs font-semibold text-slate-700">
                  Restore Target
                </label>
                <select
                  id="restore-target"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={restoreForm.restoreTarget}
                  onChange={(event) =>
                    setRestoreForm((prev) => ({
                      ...prev,
                      restoreTarget: event.target.value as "production" | "staging_tenant" | "staging_workspace"
                    }))
                  }
                >
                  <option value="staging_tenant">Restore to staging tenant</option>
                  <option value="staging_workspace">Restore to staging workspace</option>
                  <option value="production">Restore to production tenant</option>
                </select>
                <p className="text-[11px] text-slate-500">
                  Select where restored data should be applied.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="restore-staging-tenant-id" className="text-xs font-semibold text-slate-700">
                  Staging Tenant ID
                </label>
                <Input
                  id="restore-staging-tenant-id"
                  value={restoreForm.stagingTenantId}
                  onChange={(event) =>
                    setRestoreForm((prev) => ({ ...prev, stagingTenantId: event.target.value }))
                  }
                  placeholder="Optional staging tenant id"
                />
                <p className="text-[11px] text-slate-500">
                  Required when target is a specific staging tenant environment.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="restore-risk-level" className="text-xs font-semibold text-slate-700">
                  Risk Level
                </label>
                <select
                  id="restore-risk-level"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={restoreForm.riskLevel}
                  onChange={(event) =>
                    setRestoreForm((prev) => ({
                      ...prev,
                      riskLevel: event.target.value as "low" | "medium" | "high" | "critical"
                    }))
                  }
                >
                  <option value="low">Risk: Low</option>
                  <option value="medium">Risk: Medium</option>
                  <option value="high">Risk: High</option>
                  <option value="critical">Risk: Critical</option>
                </select>
                <p className="text-[11px] text-slate-500">
                  Operational impact level used for approval and audit workflows.
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="restore-reason" className="text-xs font-semibold text-slate-700">
                Restore Reason and Verification Plan
              </label>
              <textarea
                id="restore-reason"
                className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={restoreForm.reason}
                onChange={(event) => setRestoreForm((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="Describe why this restore is needed and how it will be validated."
                required
              />
              <p className="text-[11px] text-slate-500">
                Include incident context, impact, and post-restore validation checks.
              </p>
            </div>
            <p className="text-xs text-amber-700">
              Restore operations are tenant-scoped and require explicit confirmation and audit logging.
            </p>
            <Button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Create Restore Request"}
            </Button>
          </form>
        ) : null}

        {activeTab === "snapshot_history" ? (
          <div className="max-h-60 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Reference</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Captured</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snapshot) => (
                  <tr key={toText(snapshot.id)} className="border-b border-slate-100">
                    <td className="py-2">{toText(snapshot.snapshot_reference)}</td>
                    <td className="py-2">{toText(snapshot.snapshot_type)}</td>
                    <td className="py-2">{toText(snapshot.captured_at)}</td>
                    <td className="py-2">{toText(snapshot.status)}</td>
                    <td className="py-2">{toText(snapshot.expires_at) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === "restore_history" ? (
          <div className="max-h-52 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Outcome</th>
                  <th className="py-2">Target</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2">Completed</th>
                </tr>
              </thead>
              <tbody>
                {restoreHistory.map((row) => (
                  <tr key={toText(row.id)} className="border-b border-slate-100">
                    <td className="py-2">{toText(row.outcome)}</td>
                    <td className="py-2">{toText(row.restore_target)}</td>
                    <td className="py-2">{toText(row.reason)}</td>
                    <td className="py-2">{toText(row.completed_at) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === "provisioning" ? (
          <div>
            <p className="text-xs text-slate-600">
              Active modules:{" "}
              {entitlements.length > 0
                ? entitlements.map((entry) => toText(entry.module_key)).filter(Boolean).join(", ")
                : "None"}
            </p>
            <div className="mt-2 max-h-40 overflow-auto text-xs text-slate-600">
              {provisioningRuns.map((run) => (
                <div key={toText(run.id)} className="border-b border-slate-100 py-1">
                  {toText(run.created_at)} - {toText(run.status)} - {toText(run.organization_name)}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
