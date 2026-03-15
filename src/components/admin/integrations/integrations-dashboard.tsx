"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type IntegrationRow = {
  integrationKey: string;
  name: string;
  description?: string | null;
  connectionStatus?: string;
  lastSyncDate?: string | null;
  status?: string;
};

export function IntegrationsDashboard({
  initialIntegrations,
  apiPaused = false
}: {
  initialIntegrations: IntegrationRow[];
  apiPaused?: boolean;
}) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return initialIntegrations;
    return initialIntegrations.filter((row) => row.name.toLowerCase().includes(normalized));
  }, [initialIntegrations, search]);

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
              <p className="text-xs text-slate-500">{row.description || "No description provided."}</p>
              <div className="grid gap-2 text-xs">
                <TileLabel label="Connection Status" value={row.connectionStatus || "Not Tested"} />
                <TileLabel label="Status" value={row.status || "Disabled"} />
                <TileLabel label="Last Sync" value={formatDate(row.lastSyncDate ?? null)} />
              </div>
            </div>
            <div className="mt-3">
              <Link href={`/staff/admin/integrations/${encodeURIComponent(row.integrationKey)}`}>
                <Button type="button" variant="secondary">
                  Open
                </Button>
              </Link>
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
