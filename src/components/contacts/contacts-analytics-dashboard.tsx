"use client";

import { useState } from "react";
import { ANALYTICS_RANGES, type AnalyticsRangeKey } from "@/lib/analytics/config";
import { LineChart } from "@/components/analytics/line-chart";

type ContactAnalyticsPayload = {
  range: AnalyticsRangeKey;
  granularity: "day" | "week" | "month" | "year";
  donors: Array<{ x: string; label: string; y: number }>;
  leads: Array<{ x: string; label: string; y: number }>;
  nonLeads: Array<{ x: string; label: string; y: number }>;
  totals: {
    allContacts: number;
    personalContacts: number;
    organizationContacts: number;
    donors: number;
    leads: number;
    nonLeads: number;
  };
};

export function ContactsAnalyticsDashboard({
  initial
}: {
  initial: ContactAnalyticsPayload;
}) {
  const [payload, setPayload] = useState<ContactAnalyticsPayload>(initial);
  const [range, setRange] = useState<AnalyticsRangeKey>(initial.range);
  const [loading, setLoading] = useState(false);

  async function onRangeChange(nextRange: AnalyticsRangeKey) {
    setRange(nextRange);
    setLoading(true);
    const response = await fetch(`/api/analytics/contacts?range=${nextRange}`);
    const data = await response.json();
    if (response.ok) {
      setPayload(data as ContactAnalyticsPayload);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Tracking Status Trends •{" "}
          {ANALYTICS_RANGES.find((entry) => entry.key === range)?.label ?? "Last 30 days"}
        </p>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={range}
          onChange={(event) => onRangeChange(event.target.value as AnalyticsRangeKey)}
        >
          {ANALYTICS_RANGES.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? <p className="text-sm text-slate-500">Updating trends...</p> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Donors</p>
          <p className="mb-2 text-2xl font-semibold text-slate-900">{payload.totals.donors}</p>
          <LineChart
            title="Donors Trend"
            yAxisLabel="Count"
            xAxisLabel="Time"
            size="mini"
            series={[
              {
                name: "Donors",
                color: "#2563EB",
                points: payload.donors.map((point) => ({ label: point.label, y: point.y }))
              }
            ]}
          />
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Leads</p>
          <p className="mb-2 text-2xl font-semibold text-slate-900">{payload.totals.leads}</p>
          <LineChart
            title="Leads Trend"
            yAxisLabel="Count"
            xAxisLabel="Time"
            size="mini"
            series={[
              {
                name: "Leads",
                color: "#7C3AED",
                points: payload.leads.map((point) => ({ label: point.label, y: point.y }))
              }
            ]}
          />
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Non-Leads</p>
          <p className="mb-2 text-2xl font-semibold text-slate-900">{payload.totals.nonLeads}</p>
          <LineChart
            title="Non-Leads Trend"
            yAxisLabel="Count"
            xAxisLabel="Time"
            size="mini"
            series={[
              {
                name: "Non-Leads",
                color: "#0F766E",
                points: payload.nonLeads.map((point) => ({ label: point.label, y: point.y }))
              }
            ]}
          />
        </div>
      </div>
    </div>
  );
}
