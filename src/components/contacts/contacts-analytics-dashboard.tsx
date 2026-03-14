"use client";

import { useState } from "react";
import { ANALYTICS_RANGES, type AnalyticsRangeKey } from "@/lib/analytics/config";
import { LineChart } from "@/components/analytics/line-chart";

type ContactAnalyticsPayload = {
  range: AnalyticsRangeKey;
  granularity: "day" | "week" | "month" | "year";
  personal: Array<{ x: string; label: string; y: number }>;
  organizations: Array<{ x: string; label: string; y: number }>;
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
          Range: {ANALYTICS_RANGES.find((entry) => entry.key === range)?.label ?? "Last 30 days"}
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

      <LineChart
        title="Personal Contacts Trend"
        yAxisLabel="Contacts"
        xAxisLabel="Time"
        series={[
          {
            name: "Personal Contacts",
            color: "#2563EB",
            points: payload.personal.map((point) => ({ label: point.label, y: point.y }))
          }
        ]}
      />

      <LineChart
        title="Organizational Contacts Trend"
        yAxisLabel="Contacts"
        xAxisLabel="Time"
        series={[
          {
            name: "Organizational Contacts",
            color: "#7C3AED",
            points: payload.organizations.map((point) => ({ label: point.label, y: point.y }))
          }
        ]}
      />
    </div>
  );
}
