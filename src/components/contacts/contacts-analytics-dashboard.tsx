"use client";

import { useState } from "react";
import { ANALYTICS_RANGES, type AnalyticsRangeKey } from "@/lib/analytics/config";
import { LineChart } from "@/components/analytics/line-chart";
import Link from "next/link";

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
  latestModifiedContacts: Array<{
    contactId: string;
    contactName: string;
    contactType: "Personal" | "Organization";
    mostRecentActivityType: string;
    mostRecentActivityDateTime: string;
    mostRecentActivityDateTimeLabel: string;
    modifiedBy: string;
    summary: string;
  }>;
};

export function ContactsAnalyticsDashboard({
  initial
}: {
  initial: ContactAnalyticsPayload;
}) {
  const [payload, setPayload] = useState<ContactAnalyticsPayload>(initial);
  const [range, setRange] = useState<AnalyticsRangeKey>(initial.range);
  const [loading, setLoading] = useState(false);
  const [expandedChart, setExpandedChart] = useState<"donors" | "leads" | "nonLeads" | null>(null);

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

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Contacts (CRM)</p>
          <p className="text-xl font-semibold text-slate-900">{payload.totals.allContacts}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Donors</p>
          <p className="text-xl font-semibold text-slate-900">{payload.totals.donors}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Leads / Non-Leads</p>
          <p className="text-xl font-semibold text-slate-900">
            {payload.totals.leads} / {payload.totals.nonLeads}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <LineChart
          title="New Donors Trend"
          yAxisLabel="New Donors"
          xAxisLabel="Time"
          size="compact"
          onExpand={() => setExpandedChart("donors")}
          series={[
            {
              name: "Donors",
              color: "#2563EB",
              points: payload.donors.map((point) => ({ label: point.label, y: point.y }))
            }
          ]}
        />

        <LineChart
          title="New Leads Trend"
          yAxisLabel="New Leads"
          xAxisLabel="Time"
          size="compact"
          onExpand={() => setExpandedChart("leads")}
          series={[
            {
              name: "Leads",
              color: "#7C3AED",
              points: payload.leads.map((point) => ({ label: point.label, y: point.y }))
            }
          ]}
        />

        <LineChart
          title="New Non-Leads Trend"
          yAxisLabel="New Non-Leads"
          xAxisLabel="Time"
          size="compact"
          onExpand={() => setExpandedChart("nonLeads")}
          series={[
            {
              name: "Non-Leads",
              color: "#0F766E",
              points: payload.nonLeads.map((point) => ({ label: point.label, y: point.y }))
            }
          ]}
        />
      </div>

      <section className="rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Latest Modified Contacts</h3>
        <p className="mb-3 text-xs text-slate-600">
          Ranked by most recent related activity (donations, notes, tasks, and contact-linked operations).
        </p>
        {payload.latestModifiedContacts.length === 0 ? (
          <p className="text-sm text-slate-500">No recent contact-related activity.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2">Contact Name</th>
                  <th className="py-2">Contact Type</th>
                  <th className="py-2">Most Recent Activity Type</th>
                  <th className="py-2">Most Recent Activity Date/Time</th>
                  <th className="py-2">Modified By</th>
                  <th className="py-2">Summary</th>
                </tr>
              </thead>
              <tbody>
                {payload.latestModifiedContacts.map((row) => (
                  <tr key={`${row.contactId}-${row.mostRecentActivityDateTime}`} className="border-b border-slate-100">
                    <td className="py-2">
                      <Link href={`/staff/contacts/${row.contactId}`} className="font-medium text-brand-700">
                        {row.contactName}
                      </Link>
                    </td>
                    <td className="py-2">{row.contactType}</td>
                    <td className="py-2">{row.mostRecentActivityType}</td>
                    <td className="py-2">{row.mostRecentActivityDateTimeLabel}</td>
                    <td className="py-2">{row.modifiedBy}</td>
                    <td className="py-2">{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {expandedChart ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-[96vw] max-w-[1400px] rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">
                {expandedChart === "donors"
                  ? "New Donors Trend"
                  : expandedChart === "leads"
                    ? "New Leads Trend"
                    : "New Non-Leads Trend"}{" "}
                (Expanded)
              </h4>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setExpandedChart(null)}
              >
                Close
              </button>
            </div>
            <LineChart
              title={
                expandedChart === "donors"
                  ? "New Donors Trend"
                  : expandedChart === "leads"
                    ? "New Leads Trend"
                    : "New Non-Leads Trend"
              }
              yAxisLabel={
                expandedChart === "donors"
                  ? "New Donors"
                  : expandedChart === "leads"
                    ? "New Leads"
                    : "New Non-Leads"
              }
              xAxisLabel="Time"
              size="expanded"
              series={[
                {
                  name:
                    expandedChart === "donors"
                      ? "Donors"
                      : expandedChart === "leads"
                        ? "Leads"
                        : "Non-Leads",
                  color:
                    expandedChart === "donors"
                      ? "#2563EB"
                      : expandedChart === "leads"
                        ? "#7C3AED"
                        : "#0F766E",
                  points:
                    expandedChart === "donors"
                      ? payload.donors.map((point) => ({ label: point.label, y: point.y }))
                      : expandedChart === "leads"
                        ? payload.leads.map((point) => ({ label: point.label, y: point.y }))
                        : payload.nonLeads.map((point) => ({ label: point.label, y: point.y }))
                }
              ]}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
