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
  lastServerResponseAt?: string | null;
  lastRecordProcessedAt?: string | null;
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
                <p className="mt-2 text-xs text-slate-700">
                  Last Server Response:{" "}
                  <span className="font-medium">
                    {formatDateTime(row.lastServerResponseAt ?? row.lastRecordProcessedAt ?? null)}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {row.canManageIntegration ? (
                <Link href={`/staff/admin/integrations/${encodeURIComponent(row.integrationKey)}`}>
                  <Button type="button" variant="secondary">
                    Open
                  </Button>
                </Link>
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

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatDate(value);
  return parsed.toLocaleString();
}
