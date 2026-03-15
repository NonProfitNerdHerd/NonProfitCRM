"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

type IntegrationRow = {
  integrationKey: string;
  name: string;
};

export function IntegrationsDashboard({
  initialIntegrations,
  apiPaused = false
}: {
  initialIntegrations: IntegrationRow[];
  apiPaused?: boolean;
}) {
  const rows = initialIntegrations;

  return (
    <section className="rounded-md border border-slate-200 p-4">
      {apiPaused ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Integrations API is temporarily disabled while this integration implementation is being
          restarted from scratch.
        </p>
      ) : null}
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.integrationKey}
            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
          >
            <p className="text-sm font-medium text-slate-900">{row.name}</p>
            <Link href={`/staff/admin/integrations/${encodeURIComponent(row.integrationKey)}`}>
              <Button type="button" variant="secondary">
                Open
              </Button>
            </Link>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">No integrations available.</p>
        ) : null}
      </div>
    </section>
  );
}
