"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TierRow = Record<string, unknown>;

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function BackupTierDashboard({ initialTiers }: { initialTiers: TierRow[] }) {
  const [tiers, setTiers] = useState(initialTiers);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    id: "",
    key: "",
    name: "",
    description: "",
    backupFrequency: "daily",
    retentionDays: "30",
    supportsPointInTimeRestore: false,
    supportsStagingRestore: true,
    supportsCustomRestoreWindow: false,
    isCustom: false,
    isActive: true
  });

  async function reload() {
    setLoading(true);
    const response = await fetch("/api/platform/backup-tiers");
    const payload = (await response.json().catch(() => null)) as { tiers?: TierRow[]; message?: string } | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to load backup tiers.");
      setLoading(false);
      return;
    }
    setTiers(payload?.tiers ?? []);
    setLoading(false);
  }

  async function saveTier(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/platform/backup-tiers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: form.id || undefined,
        key: form.key,
        name: form.name,
        description: form.description || null,
        backupFrequency: form.backupFrequency,
        retentionDays: Number(form.retentionDays),
        supportsPointInTimeRestore: form.supportsPointInTimeRestore,
        supportsStagingRestore: form.supportsStagingRestore,
        supportsCustomRestoreWindow: form.supportsCustomRestoreWindow,
        isCustom: form.isCustom,
        isActive: form.isActive
      })
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to save backup tier.");
      setLoading(false);
      return;
    }
    setMessage("Backup tier saved.");
    setForm({
      id: "",
      key: "",
      name: "",
      description: "",
      backupFrequency: "daily",
      retentionDays: "30",
      supportsPointInTimeRestore: false,
      supportsStagingRestore: true,
      supportsCustomRestoreWindow: false,
      isCustom: false,
      isActive: true
    });
    await reload();
  }

  function loadIntoForm(tier: TierRow) {
    setForm({
      id: toText(tier.id),
      key: toText(tier.key),
      name: toText(tier.name),
      description: toText(tier.description),
      backupFrequency: toText(tier.backup_frequency) || "daily",
      retentionDays: toText(tier.retention_days) || "30",
      supportsPointInTimeRestore: Boolean(tier.supports_point_in_time_restore),
      supportsStagingRestore: Boolean(tier.supports_staging_restore),
      supportsCustomRestoreWindow: Boolean(tier.supports_custom_restore_window),
      isCustom: Boolean(tier.is_custom),
      isActive: Boolean(tier.is_active)
    });
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">Backup Tier Definitions</p>
          <Button type="button" variant="secondary" onClick={() => void reload()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Key</th>
                <th className="py-2">Name</th>
                <th className="py-2">Frequency</th>
                <th className="py-2">Retention</th>
                <th className="py-2">PITR</th>
                <th className="py-2">Active</th>
                <th className="py-2">Edit</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={toText(tier.id)} className="border-b border-slate-100">
                  <td className="py-2">{toText(tier.key)}</td>
                  <td className="py-2">{toText(tier.name)}</td>
                  <td className="py-2">{toText(tier.backup_frequency)}</td>
                  <td className="py-2">{toText(tier.retention_days)} days</td>
                  <td className="py-2">{Boolean(tier.supports_point_in_time_restore) ? "Yes" : "No"}</td>
                  <td className="py-2">{Boolean(tier.is_active) ? "Yes" : "No"}</td>
                  <td className="py-2">
                    <Button type="button" variant="secondary" onClick={() => loadIntoForm(tier)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-900">
          {form.id ? "Update Backup Tier" : "Create Backup Tier"}
        </p>
        <form className="space-y-3" onSubmit={saveTier}>
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              value={form.key}
              onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))}
              placeholder="tier key"
              required
            />
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Tier name"
              required
            />
            <Input
              value={form.backupFrequency}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, backupFrequency: event.target.value }))
              }
              placeholder="backup frequency"
              required
            />
            <Input
              value={form.retentionDays}
              onChange={(event) => setForm((prev) => ({ ...prev, retentionDays: event.target.value }))}
              placeholder="retention days"
              required
            />
          </div>
          <textarea
            className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
          />
          <div className="grid gap-2 md:grid-cols-3">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={form.supportsPointInTimeRestore}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    supportsPointInTimeRestore: event.target.checked
                  }))
                }
              />
              Supports point-in-time restore
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={form.supportsStagingRestore}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, supportsStagingRestore: event.target.checked }))
                }
              />
              Supports staging restore
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={form.supportsCustomRestoreWindow}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    supportsCustomRestoreWindow: event.target.checked
                  }))
                }
              />
              Supports custom restore window
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={form.isCustom}
                onChange={(event) => setForm((prev) => ({ ...prev, isCustom: event.target.checked }))}
              />
              Custom tier
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Active
            </label>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Backup Tier"}
          </Button>
        </form>
      </section>
    </div>
  );
}
