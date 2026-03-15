"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type IntegrationRow = {
  integrationKey: string;
  name: string;
  providerType: string;
  description: string | null;
  status: string;
  connectionStatus: string;
  lastSyncDate: string | null;
  lastSyncResult: string;
  isEnabled: boolean;
};

type SummaryCards = {
  totalIntegrations: number;
  enabledIntegrations: number;
  failedJobs: number;
  last24hSyncActivity: number;
};

export function IntegrationsDashboard({
  initialIntegrations,
  summary
}: {
  initialIntegrations: IntegrationRow[];
  summary: SummaryCards;
}) {
  const [rows, setRows] = useState(initialIntegrations);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesText =
        !search.trim() ||
        row.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        row.providerType.toLowerCase().includes(search.trim().toLowerCase()) ||
        String(row.description ?? "")
          .toLowerCase()
          .includes(search.trim().toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && row.isEnabled) ||
        (statusFilter === "disabled" && !row.isEnabled);
      return matchesText && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  async function refreshDashboard() {
    const response = await fetch("/api/admin/integrations");
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to refresh integrations.");
    setRows((payload?.integrations ?? []) as IntegrationRow[]);
  }

  async function testConnection(integrationKey: string) {
    setLoadingKey(`test-${integrationKey}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/test-connection`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Connection test failed.");
      await refreshDashboard();
      setMessage(payload?.message ?? "Connection test completed.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Connection test failed.");
    } finally {
      setLoadingKey(null);
    }
  }

  async function runSync(integrationKey: string) {
    setLoadingKey(`sync-${integrationKey}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/all`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Full sync failed.");
      await refreshDashboard();
      setMessage(`Sync started/completed. Job ${String(payload?.jobId ?? "-")}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Full sync failed.");
    } finally {
      setLoadingKey(null);
    }
  }

  async function toggleEnabled(row: IntegrationRow) {
    setLoadingKey(`toggle-${row.integrationKey}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(row.integrationKey)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isEnabled: !row.isEnabled })
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to update integration.");
      await refreshDashboard();
      setMessage(`${row.name} ${row.isEnabled ? "disabled" : "enabled"}.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update integration.");
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Total Integrations" value={String(summary.totalIntegrations)} />
        <SummaryCard label="Enabled Integrations" value={String(summary.enabledIntegrations)} />
        <SummaryCard label="Failed Jobs" value={String(summary.failedJobs)} />
        <SummaryCard label="Last 24h Sync Activity" value={String(summary.last24hSyncActivity)} />
      </div>

      <section className="rounded-md border border-slate-200 p-4">
        <div className="mb-3 grid gap-3 md:grid-cols-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search integrations..."
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "enabled" | "disabled")
            }
          >
            <option value="all">All Statuses</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        {message ? <p className="mb-2 text-sm text-green-700">{message}</p> : null}
        {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Integration Name</th>
                <th className="py-2">Provider Type</th>
                <th className="py-2">Description</th>
                <th className="py-2">Status</th>
                <th className="py-2">Connection Status</th>
                <th className="py-2">Last Sync Date</th>
                <th className="py-2">Last Sync Result</th>
                <th className="py-2">Enabled</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.integrationKey} className="border-b border-slate-100 align-top">
                  <td className="py-2 font-medium text-slate-900">{row.name}</td>
                  <td className="py-2">{row.providerType}</td>
                  <td className="py-2">{row.description ?? "-"}</td>
                  <td className="py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="py-2">
                    <StatusBadge status={row.connectionStatus} />
                  </td>
                  <td className="py-2">{formatDate(row.lastSyncDate)}</td>
                  <td className="py-2">{row.lastSyncResult}</td>
                  <td className="py-2">{row.isEnabled ? "Yes" : "No"}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      <Link href={`/staff/admin/integrations/${encodeURIComponent(row.integrationKey)}`}>
                        <Button type="button" variant="secondary">Open</Button>
                      </Link>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void testConnection(row.integrationKey)}
                        disabled={Boolean(loadingKey)}
                      >
                        {loadingKey === `test-${row.integrationKey}` ? "Testing..." : "Test Connection"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void runSync(row.integrationKey)}
                        disabled={Boolean(loadingKey)}
                      >
                        {loadingKey === `sync-${row.integrationKey}` ? "Syncing..." : "Run Sync"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void toggleEnabled(row)}
                        disabled={Boolean(loadingKey)}
                      >
                        {loadingKey === `toggle-${row.integrationKey}`
                          ? "Saving..."
                          : row.isEnabled
                            ? "Disable"
                            : "Enable"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="py-3 text-sm text-slate-500" colSpan={9}>
                    No integrations match current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const classes =
    normalized.includes("fail")
      ? "bg-red-100 text-red-700"
      : normalized.includes("disabled") || normalized === "no"
        ? "bg-slate-100 text-slate-700"
        : normalized.includes("connected") || normalized.includes("enabled") || normalized.includes("success")
          ? "bg-green-100 text-green-700"
          : "bg-amber-100 text-amber-700";
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${classes}`}>{status}</span>;
}
