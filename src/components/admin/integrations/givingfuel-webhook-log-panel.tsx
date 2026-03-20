"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type WebhookLogPayload = {
  rows: Array<{
    id: string;
    received_at: string | null;
    processed_at: string | null;
    provider_event_id: string | null;
    event_type: string | null;
    processing_status: string | null;
    error_message: string | null;
    created_transaction_id: string | null;
  }>;
};

export function GivingFuelWebhookLogPanel({ integrationKey }: { integrationKey: string }) {
  const [webhookLog, setWebhookLog] = useState<WebhookLogPayload>({ rows: [] });
  const [logLimit, setLogLimit] = useState(10);
  const [loadingLog, setLoadingLog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadWebhookLog(limit = logLimit) {
    setLoadingLog(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/webhook/log?limit=${encodeURIComponent(String(limit))}`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Failed to load webhook log.");
      }
      setWebhookLog(payload as WebhookLogPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load webhook log.");
    } finally {
      setLoadingLog(false);
    }
  }

  useEffect(() => {
    void loadWebhookLog(10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationKey]);

  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-4">
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">Webhook Log</h4>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-700" htmlFor="webhook-log-limit">
            Show
          </label>
          <select
            id="webhook-log-limit"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={logLimit}
            onChange={(event) => {
              const next = Number(event.target.value);
              setLogLimit(next);
              void loadWebhookLog(next);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
          </select>
          <Button type="button" variant="secondary" onClick={() => void loadWebhookLog()} disabled={loadingLog}>
            {loadingLog ? "Refreshing..." : "Refresh Log"}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Received</th>
              <th className="py-2">Provider Event ID</th>
              <th className="py-2">Event Type</th>
              <th className="py-2">Status</th>
              <th className="py-2">Processed</th>
              <th className="py-2">Created Transaction</th>
              <th className="py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {webhookLog.rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-2">{formatDateTime(row.received_at)}</td>
                <td className="py-2">{row.provider_event_id || "-"}</td>
                <td className="py-2">{row.event_type || "-"}</td>
                <td className="py-2">{row.processing_status || "-"}</td>
                <td className="py-2">{formatDateTime(row.processed_at)}</td>
                <td className="py-2">{row.created_transaction_id || "-"}</td>
                <td className="py-2">{row.error_message || "-"}</td>
              </tr>
            ))}
            {webhookLog.rows.length === 0 ? (
              <tr>
                <td className="py-3 text-slate-500" colSpan={7}>
                  No webhook attempts logged yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}
