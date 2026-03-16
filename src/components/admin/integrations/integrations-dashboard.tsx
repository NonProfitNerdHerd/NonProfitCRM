"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type IntegrationRow = {
  integrationKey: string;
  name: string;
  description?: string | null;
  enabledStatus?: string;
  isEnabled?: boolean;
  syncStatus?: "Fully Synced" | "Currently Working" | "Could Not Complete";
  syncStatusColor?: "green" | "yellow" | "red";
  statusDetail?: string;
  runId?: string | null;
  connectionStatus?: string;
  lastSyncStartTime?: string | null;
  lastSyncEndTime?: string | null;
  lastSuccessfulSyncTime?: string | null;
  recordsRetrieved?: number;
  recordsProcessed?: number;
  recordsInserted?: number;
  recordsUpdated?: number;
  recordsSkipped?: number;
  recordsFailed?: number;
  totalRecordsExpected?: number | null;
  currentPage?: number | null;
  currentCursor?: string | null;
  errorSummary?: string | null;
  canManageIntegration?: boolean;
};

export function IntegrationsDashboard({
  initialIntegrations,
  apiPaused = false
}: {
  initialIntegrations: IntegrationRow[];
  apiPaused?: boolean;
}) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [search, setSearch] = useState("");
  const [togglingByKey, setTogglingByKey] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshIntegrations() {
    const response = await fetch("/api/admin/integrations", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to refresh integrations.");
    }
    const rows = Array.isArray(payload?.integrations) ? (payload.integrations as IntegrationRow[]) : [];
    setIntegrations(rows);
  }

  useEffect(() => {
    setIntegrations(initialIntegrations);
  }, [initialIntegrations]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshIntegrations().catch(() => {
        // Preserve existing view when periodic refresh fails.
      });
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleIntegration(integrationKey: string, isEnabled: boolean) {
    setMessage(null);
    setError(null);
    setTogglingByKey((prev) => ({ ...prev, [integrationKey]: true }));
    try {
      const response = await fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isEnabled })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to update integration state.");
      }
      await refreshIntegrations();
      setMessage(`${isEnabled ? "Enabled" : "Disabled"} integration successfully.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update integration state.");
    } finally {
      setTogglingByKey((prev) => ({ ...prev, [integrationKey]: false }));
    }
  }

  const rows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return integrations;
    return integrations.filter((row) => row.name.toLowerCase().includes(normalized));
  }, [integrations, search]);

  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-4">
      {apiPaused ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Integrations API is temporarily disabled while this integration implementation is being
          restarted from scratch.
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="max-w-md">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search integrations by name..."
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div
            key={row.integrationKey}
            className="flex h-full flex-col justify-between rounded-md border border-slate-200 bg-white p-4"
          >
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">{row.name}</p>
              <p className="text-xs text-slate-500">{row.description || "No description provided."}</p>
              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                <p className="uppercase tracking-wide text-slate-500">Sync Status</p>
                <p
                  className={`inline-flex items-center gap-1 text-sm font-medium ${
                    row.syncStatusColor === "green"
                      ? "text-emerald-700"
                      : row.syncStatusColor === "yellow"
                        ? "text-amber-700"
                        : "text-rose-700"
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      row.syncStatusColor === "green"
                        ? "bg-emerald-500"
                        : row.syncStatusColor === "yellow"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }`}
                  />
                  {row.syncStatus ?? "Could Not Complete"}
                </p>
                <p className="mt-1 text-xs text-slate-600">{row.statusDetail ?? "No status detail available."}</p>
              </div>
              <div className="grid gap-2 text-xs">
                <TileLabel label="Enabled" value={row.enabledStatus || "Disabled"} />
                <TileLabel label="Connection Status" value={row.connectionStatus || "Not Tested"} />
                <TileLabel label="Run ID" value={row.runId || "-"} />
                <TileLabel label="Last Sync Start" value={formatDateTime(row.lastSyncStartTime ?? null)} />
                <TileLabel label="Last Sync End" value={formatDateTime(row.lastSyncEndTime ?? null)} />
                <TileLabel
                  label="Last Successful Sync"
                  value={formatDateTime(row.lastSuccessfulSyncTime ?? null)}
                />
                <TileLabel
                  label="Progress"
                  value={
                    row.totalRecordsExpected && row.totalRecordsExpected > 0
                      ? `${Number(row.recordsProcessed ?? 0).toLocaleString()} of ${Number(row.totalRecordsExpected).toLocaleString()}`
                      : `${Number(row.recordsProcessed ?? 0).toLocaleString()} processed`
                  }
                />
                <TileLabel label="Retrieved" value={Number(row.recordsRetrieved ?? 0).toLocaleString()} />
                <TileLabel label="Inserted" value={Number(row.recordsInserted ?? 0).toLocaleString()} />
                <TileLabel label="Updated" value={Number(row.recordsUpdated ?? 0).toLocaleString()} />
                <TileLabel label="Skipped" value={Number(row.recordsSkipped ?? 0).toLocaleString()} />
                <TileLabel label="Failed" value={Number(row.recordsFailed ?? 0).toLocaleString()} />
                <TileLabel
                  label="Current Page / Cursor"
                  value={`${row.currentPage ?? "-"} / ${row.currentCursor ?? "-"}`}
                />
                {row.errorSummary ? <TileLabel label="Error Summary" value={row.errorSummary} /> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {row.canManageIntegration ? (
                <Link href={`/staff/admin/integrations/${encodeURIComponent(row.integrationKey)}`}>
                  <Button type="button" variant="secondary">
                    Open
                  </Button>
                </Link>
              ) : null}
              {row.canManageIntegration ? (
                <Button
                  type="button"
                  variant={row.isEnabled ? "danger" : "primary"}
                  onClick={() => void toggleIntegration(row.integrationKey, !row.isEnabled)}
                  disabled={Boolean(togglingByKey[row.integrationKey])}
                >
                  {togglingByKey[row.integrationKey]
                    ? row.isEnabled
                      ? "Disabling..."
                      : "Enabling..."
                    : row.isEnabled
                      ? "Disable Integration"
                      : "Enable Integration"}
                </Button>
              ) : (
                <span className="text-xs text-slate-500">
                  Read-only: integration configuration is restricted.
                </span>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">No integrations match your search.</p>
        ) : null}
      </div>
    </section>
  );
}

function TileLabel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
      <p className="uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-slate-800">{value}</p>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatDate(value);
  return parsed.toLocaleString();
}
