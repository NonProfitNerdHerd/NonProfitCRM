"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type RestoreRequestRow = Record<string, unknown>;

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function RestoreRequestsDashboard({ initialRequests }: { initialRequests: RestoreRequestRow[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const response = await fetch(`/api/platform/restore-requests?${params.toString()}`);
    const payload = (await response.json().catch(() => null)) as
      | { requests?: RestoreRequestRow[]; message?: string }
      | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to load restore requests.");
      setLoading(false);
      return;
    }
    setRequests(payload?.requests ?? []);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {["requested", "approved", "in_progress", "completed", "failed", "cancelled"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={() => void reload()} disabled={loading}>
              {loading ? "Loading..." : "Apply"}
            </Button>
          </div>
          <Button type="button" variant="secondary" onClick={() => void reload()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Tenant</th>
                <th className="py-2">Status</th>
                <th className="py-2">Risk</th>
                <th className="py-2">Target</th>
                <th className="py-2">Reason</th>
                <th className="py-2">Requested At</th>
                <th className="py-2">Open Tenant</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const tenant = Array.isArray(request.tenants)
                  ? request.tenants[0]
                  : (request.tenants as Record<string, unknown> | null);
                const tenantId = toText(request.tenant_id) || toText(tenant?.id);
                return (
                  <tr key={toText(request.id)} className="border-b border-slate-100">
                    <td className="py-2">
                      {toText(tenant?.organization_name) || tenantId || "Unknown tenant"}
                    </td>
                    <td className="py-2">{toText(request.status)}</td>
                    <td className="py-2">{toText(request.risk_level)}</td>
                    <td className="py-2">{toText(request.restore_target)}</td>
                    <td className="py-2">{toText(request.reason)}</td>
                    <td className="py-2">{toText(request.requested_at)}</td>
                    <td className="py-2">
                      {tenantId ? (
                        <Link
                          href={`/platform/admin/tenants/${tenantId}`}
                          className="text-xs font-semibold text-brand-700 hover:text-brand-900"
                        >
                          View tenant
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
