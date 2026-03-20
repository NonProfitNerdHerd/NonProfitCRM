"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DashboardPayload = {
  moduleState: {
    connectionId: string | null;
    integrationEnabled: boolean;
    allowModuleAccess: boolean;
    pendingReviewCount: number;
    failedEventsCount: number;
  };
  summary: {
    pendingReview: number;
    processed: number;
    failed: number;
    ignored: number;
  };
  recentEvents: Array<Record<string, unknown>>;
};

type ReviewPayload = {
  moduleState: {
    connectionId: string | null;
    integrationEnabled: boolean;
    allowModuleAccess: boolean;
    pendingReviewCount: number;
    failedEventsCount: number;
  };
  rows: Array<Record<string, unknown>>;
};

export function GivingFuelOperationsDashboard() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const dashboardResponse = await fetch("/api/givingfuel/dashboard", { cache: "no-store" });
      const dashboardPayload = await dashboardResponse.json().catch(() => null);
      if (!dashboardResponse.ok) {
        throw new Error(dashboardPayload?.message ?? "Failed to load Giving Fuel dashboard.");
      }
      setDashboard(dashboardPayload as DashboardPayload);

      const reviewResponse = await fetch(
        `/api/givingfuel/review?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(search)}`,
        { cache: "no-store" }
      );
      const reviewPayload = await reviewResponse.json().catch(() => null);
      if (!reviewResponse.ok) {
        throw new Error(reviewPayload?.message ?? "Failed to load Giving Fuel review queue.");
      }
      setReview(reviewPayload as ReviewPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredRows = useMemo(() => {
    const rows = review?.rows ?? [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => {
      const donor = (row.normalized_donor_json as Record<string, unknown> | null | undefined) ?? {};
      const donorName = `${String(donor.firstName ?? "")} ${String(donor.lastName ?? "")} ${String(
        donor.organizationName ?? ""
      )}`
        .trim()
        .toLowerCase();
      const email = String(donor.email ?? "").toLowerCase();
      const externalTransactionId = String(row.external_transaction_id ?? "").toLowerCase();
      const pageId = String(row.external_page_id ?? "").toLowerCase();
      return (
        donorName.includes(normalized) ||
        email.includes(normalized) ||
        externalTransactionId.includes(normalized) ||
        pageId.includes(normalized)
      );
    });
  }, [review?.rows, search]);

  async function bulkApprove() {
    if (selectedIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/givingfuel/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importIds: selectedIds })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Bulk approval failed.");
      }
      setSelectedIds([]);
      await load();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Bulk approval failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Loading Giving Fuel operations...</p>;
  }

  if (!dashboard) {
    return <p className="text-sm text-rose-700">Unable to load Giving Fuel operations.</p>;
  }

  const moduleState = dashboard.moduleState;
  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {!moduleState.integrationEnabled ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          GivingFuel module is visible, but integration processing is disabled. Webhook deliveries are
          stored without processing until integration is enabled.
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Pending Review" value={dashboard.summary.pendingReview} />
        <Metric label="Processed" value={dashboard.summary.processed} />
        <Metric label="Failed/Invalid" value={dashboard.summary.failed} />
        <Metric label="Ignored" value={dashboard.summary.ignored} />
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Transaction Review Queue</h3>
          <div className="flex gap-2">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="pending_review">Pending Review</option>
              <option value="auto_accepted">Auto Accepted</option>
              <option value="approved">Approved</option>
              <option value="corrected">Corrected</option>
              <option value="rejected">Rejected</option>
              <option value="ignored">Ignored</option>
            </select>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search donor/email/transaction/page"
            />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
            <Button type="button" onClick={() => void bulkApprove()} disabled={saving || selectedIds.length === 0}>
              {saving ? "Approving..." : `Bulk Approve (${selectedIds.length})`}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Select</th>
                <th className="py-2">Created</th>
                <th className="py-2">Donor</th>
                <th className="py-2">Transaction ID</th>
                <th className="py-2">Campaign Match</th>
                <th className="py-2">Donor Match</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Status</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const id = String(row.id ?? "");
                const donor = (row.normalized_donor_json as Record<string, unknown> | null | undefined) ?? {};
                const tx = (row.normalized_transaction_json as Record<string, unknown> | null | undefined) ?? {};
                const selected = selectedIds.includes(id);
                return (
                  <tr key={id} className="border-b border-slate-100">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          setSelectedIds((prev) =>
                            event.target.checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)
                          )
                        }
                      />
                    </td>
                    <td className="py-2">{formatDateTime(String(row.created_at ?? ""))}</td>
                    <td className="py-2">
                      {String(donor.firstName ?? "")} {String(donor.lastName ?? "")}
                      {String(donor.organizationName ?? "") ? ` (${String(donor.organizationName)})` : ""}
                      <div className="text-xs text-slate-500">{String(donor.email ?? "")}</div>
                    </td>
                    <td className="py-2">{String(row.external_transaction_id ?? "-")}</td>
                    <td className="py-2">
                      {String(row.campaign_match_rule ?? "-")} ({Number(row.campaign_match_confidence ?? 0)})
                    </td>
                    <td className="py-2">
                      {String(row.donor_match_rule ?? "-")} ({Number(row.donor_match_confidence ?? 0)})
                    </td>
                    <td className="py-2">{Number(tx.amount ?? 0).toLocaleString()}</td>
                    <td className="py-2">{String(row.review_status ?? "-")}</td>
                    <td className="py-2">
                      <Link
                        href={`/staff/data-tools/giving-fuel/review/${encodeURIComponent(id)}`}
                        className="text-sm font-medium text-blue-700 underline"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={9}>
                    No review items found for current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2 rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Recent Webhook Events</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Received</th>
                <th className="py-2">Event Type</th>
                <th className="py-2">Provider Event</th>
                <th className="py-2">Status</th>
                <th className="py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentEvents.map((row) => (
                <tr key={String(row.id)} className="border-b border-slate-100">
                  <td className="py-2">{formatDateTime(String(row.received_at ?? ""))}</td>
                  <td className="py-2">{String(row.event_type ?? "-")}</td>
                  <td className="py-2">{String(row.provider_event_id ?? "-")}</td>
                  <td className="py-2">{String(row.processing_status ?? "-")}</td>
                  <td className="py-2">{String(row.error_message ?? "-")}</td>
                </tr>
              ))}
              {dashboard.recentEvents.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={5}>
                    No webhook events have been received yet.
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}
