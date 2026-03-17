"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UnknownRow = Record<string, unknown>;

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

export function TenantDetailDashboard({
  initialTenant,
  initialBackupMetadata,
  initialSnapshots,
  initialRestoreHistory,
  initialProvisioningRuns,
  initialEntitlements,
  backupTiers
}: {
  initialTenant: UnknownRow;
  initialBackupMetadata: UnknownRow | null;
  initialSnapshots: UnknownRow[];
  initialRestoreHistory: UnknownRow[];
  initialProvisioningRuns: UnknownRow[];
  initialEntitlements: UnknownRow[];
  backupTiers: UnknownRow[];
}) {
  const tenantId = toText(initialTenant.id);
  const [tenant, setTenant] = useState(initialTenant);
  const [backupMetadata, setBackupMetadata] = useState(initialBackupMetadata);
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [restoreHistory, setRestoreHistory] = useState(initialRestoreHistory);
  const [provisioningRuns] = useState(initialProvisioningRuns);
  const [entitlements, setEntitlements] = useState(initialEntitlements);
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
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">Tenant Configuration</p>
          <Button type="button" variant="secondary" onClick={() => void reloadDetail()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <form className="space-y-3" onSubmit={saveTenantConfig}>
          <div className="grid gap-2 md:grid-cols-3">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={editForm.status}
              onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="archived">archived</option>
            </select>
            <Input
              value={editForm.planPackage}
              onChange={(event) => setEditForm((prev) => ({ ...prev, planPackage: event.target.value }))}
              placeholder="Plan package"
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
            <Input
              value={editForm.primaryContactName}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, primaryContactName: event.target.value }))
              }
              placeholder="Primary contact name"
            />
            <Input
              type="email"
              value={editForm.primaryContactEmail}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, primaryContactEmail: event.target.value }))
              }
              placeholder="Primary contact email"
            />
            <Input
              value={editForm.primaryContactPhone}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, primaryContactPhone: event.target.value }))
              }
              placeholder="Primary contact phone"
            />
            <Input
              value={editForm.enabledModulesCsv}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, enabledModulesCsv: event.target.value }))
              }
              placeholder="Enabled modules CSV"
            />
          </div>
          <textarea
            className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={editForm.internalNotes}
            onChange={(event) => setEditForm((prev) => ({ ...prev, internalNotes: event.target.value }))}
            placeholder="Internal notes"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Tenant Configuration"}
          </Button>
        </form>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
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
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-900">Restore Request Workflow</p>
        <form className="space-y-3" onSubmit={submitRestoreRequest}>
          <div className="grid gap-2 md:grid-cols-3">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
            <Input
              type="datetime-local"
              value={restoreForm.backupPointInTime}
              onChange={(event) =>
                setRestoreForm((prev) => ({ ...prev, backupPointInTime: event.target.value }))
              }
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
            <Input
              value={restoreForm.stagingTenantId}
              onChange={(event) =>
                setRestoreForm((prev) => ({ ...prev, stagingTenantId: event.target.value }))
              }
              placeholder="Optional staging tenant id"
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
          </div>
          <textarea
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={restoreForm.reason}
            onChange={(event) => setRestoreForm((prev) => ({ ...prev, reason: event.target.value }))}
            placeholder="Restore reason and verification plan (required)"
            required
          />
          <p className="text-xs text-amber-700">
            Restore operations are tenant-scoped and require explicit confirmation and audit logging.
          </p>
          <Button type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Create Restore Request"}
          </Button>
        </form>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">Snapshot History</p>
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
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">Restore History</p>
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
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">Provisioning & Entitlements</p>
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
      </section>
    </div>
  );
}
