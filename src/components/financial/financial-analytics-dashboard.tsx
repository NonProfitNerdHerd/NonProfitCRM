"use client";

import Link from "next/link";
import { useState } from "react";
import { ANALYTICS_RANGES, type AnalyticsRangeKey } from "@/lib/analytics/config";
import { LineChart } from "@/components/analytics/line-chart";
import { PieChart } from "@/components/analytics/pie-chart";
import { formatCurrency, formatDate } from "@/lib/utils";

type FinancialAnalyticsPayload = {
  range: AnalyticsRangeKey;
  granularity: "day" | "week" | "month" | "year";
  trend: Array<{ x: string; label: string; y: number }>;
  campaignDistribution: Array<{ label: string; amount: number; percentage: number }>;
  transactionTypeDistribution: Array<{ label: string; amount: number; percentage: number }>;
  totalDonations: number;
  recentTransactions: Array<Record<string, unknown>>;
};

export function FinancialAnalyticsDashboard({
  initial
}: {
  initial: FinancialAnalyticsPayload;
}) {
  const [payload, setPayload] = useState(initial);
  const [range, setRange] = useState<AnalyticsRangeKey>(initial.range);
  const [loading, setLoading] = useState(false);
  const [expandedReport, setExpandedReport] = useState<"trend" | "funds" | "types" | null>(null);

  const campaignPalette = ["#2563EB", "#7C3AED", "#0891B2", "#16A34A", "#D97706", "#DC2626", "#4F46E5"];
  const paymentPalette: Record<string, string> = {
    Cash: "#16A34A",
    Credit: "#2563EB",
    Check: "#D97706"
  };
  const trendTotal = payload.trend.reduce((sum, point) => sum + Number(point.y ?? 0), 0);
  const campaignSlices = payload.campaignDistribution.map((row, idx) => ({
    ...row,
    color: campaignPalette[idx % campaignPalette.length]
  }));
  const paymentSlices = payload.transactionTypeDistribution.map((row, idx) => ({
    ...row,
    color: paymentPalette[row.label] ?? campaignPalette[idx % campaignPalette.length]
  }));

  async function onRangeChange(nextRange: AnalyticsRangeKey) {
    setRange(nextRange);
    setLoading(true);
    const response = await fetch(`/api/analytics/financial?range=${nextRange}`);
    const data = await response.json();
    if (response.ok) {
      setPayload(data as FinancialAnalyticsPayload);
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

      {loading ? <p className="text-sm text-slate-500">Updating financial trend...</p> : null}

      <div className="grid gap-4 xl:grid-cols-10">
        <div className="xl:col-span-4">
          <LineChart
            title={`Donations Trend (${formatCurrency(trendTotal)})`}
            yAxisLabel="Donation Total"
            xAxisLabel="Time"
            size="compact"
            onExpand={() => setExpandedReport("trend")}
            series={[
              {
                name: "Donations",
                color: "#16A34A",
                points: payload.trend.map((point) => ({ label: point.label, y: point.y }))
              }
            ]}
          />
        </div>
        <div className="xl:col-span-3">
          <PieChart
            title="Fund Distribution"
            slices={campaignSlices}
            size="compact"
            onExpand={() => setExpandedReport("funds")}
            valueFormatter={(value) => formatCurrency(value)}
          />
        </div>
        <div className="xl:col-span-3">
          <PieChart
            title="Transaction Type Distribution"
            slices={paymentSlices}
            size="compact"
            onExpand={() => setExpandedReport("types")}
            valueFormatter={(value) => formatCurrency(value)}
          />
        </div>
      </div>

      {expandedReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-[96vw] max-w-[1400px] rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">
                {expandedReport === "trend"
                  ? "Donations Trend (Expanded)"
                  : expandedReport === "funds"
                    ? "Fund Distribution (Expanded)"
                    : "Transaction Type Distribution (Expanded)"}
              </h4>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setExpandedReport(null)}
              >
                Close
              </button>
            </div>
            {expandedReport === "trend" ? (
              <LineChart
                title={`Donations Trend (${formatCurrency(trendTotal)})`}
                yAxisLabel="Donation Total"
                xAxisLabel="Time"
                size="expanded"
                series={[
                  {
                    name: "Donations",
                    color: "#16A34A",
                    points: payload.trend.map((point) => ({ label: point.label, y: point.y }))
                  }
                ]}
              />
            ) : expandedReport === "funds" ? (
              <PieChart
                title={`Fund Distribution (${formatCurrency(payload.totalDonations)})`}
                slices={campaignSlices}
                size="expanded"
                valueFormatter={(value) => formatCurrency(value)}
              />
            ) : (
              <PieChart
                title={`Transaction Type Distribution (${formatCurrency(payload.totalDonations)})`}
                slices={paymentSlices}
                size="expanded"
                valueFormatter={(value) => formatCurrency(value)}
              />
            )}
          </div>
        </div>
      ) : null}

      <section className="rounded-md border border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Recent Transactions (Latest 30)</h3>
          <Link href="/staff/financial/donations" className="text-xs font-medium text-brand-700">
            View All Donations
          </Link>
        </div>

        {payload.recentTransactions.length === 0 ? (
          <p className="text-sm text-slate-500">No recent transactions available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2">Donation Date</th>
                  <th className="py-2">Donor Name</th>
                  <th className="py-2">Campaign Name</th>
                  <th className="py-2">Donation Amount</th>
                  <th className="py-2">Payment Type</th>
                </tr>
              </thead>
              <tbody>
                {payload.recentTransactions.map((donation) => {
                  const donor = Array.isArray(donation.contacts)
                    ? donation.contacts[0]
                    : donation.contacts;
                  const campaign = Array.isArray(donation.campaigns)
                    ? donation.campaigns[0]
                    : donation.campaigns;
                  return (
                    <tr key={donation.id as string} className="border-b border-slate-100">
                      <td className="py-2">
                        <Link href={`/staff/financial/donations/${donation.id as string}`}>
                          {formatDate(donation.donation_date as string)}
                        </Link>
                      </td>
                      <td className="py-2">
                        {donor ? `${donor.first_name as string} ${donor.last_name as string}` : "-"}
                      </td>
                      <td className="py-2">{(campaign?.name as string) ?? "-"}</td>
                      <td className="py-2">{formatCurrency(Number(donation.amount ?? 0))}</td>
                      <td className="py-2">{(donation.payment_type as string) ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
