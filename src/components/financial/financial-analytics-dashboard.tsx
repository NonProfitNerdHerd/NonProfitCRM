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
  donationCountTrend: Array<{ x: string; label: string; y: number }>;
  campaignDistribution: Array<{ label: string; amount: number; percentage: number }>;
  transactionTypeDistribution: Array<{ label: string; amount: number; percentage: number }>;
  totalDonations: number;
  totalDonationCount: number;
  averageDonationAmount: number;
  recentTransactions: Array<Record<string, unknown>>;
};

export function FinancialAnalyticsDashboard({
  initial
}: {
  initial: FinancialAnalyticsPayload;
}) {
  const [payload, setPayload] = useState(initial);
  const [range, setRange] = useState<AnalyticsRangeKey>(initial.range);
  const [rowLimit, setRowLimit] = useState<10 | 25 | 50 | 100>(10);
  const [loading, setLoading] = useState(false);
  const [expandedReport, setExpandedReport] = useState<
    "trendAmount" | "trendCount" | "funds" | "types" | null
  >(null);

  const campaignPalette = ["#2563EB", "#7C3AED", "#0891B2", "#16A34A", "#D97706", "#DC2626", "#4F46E5"];
  const paymentPalette: Record<string, string> = {
    Cash: "#16A34A",
    Credit: "#2563EB",
    Check: "#D97706"
  };
  const trendTotal = Number(payload.totalDonations ?? 0);
  const donationCountTotal =
    Number(payload.totalDonationCount ?? 0) ||
    payload.donationCountTrend.reduce((sum, point) => sum + Number(point.y ?? 0), 0);
  const averageDonationAmount =
    Number(payload.averageDonationAmount ?? 0) ||
    (donationCountTotal > 0 ? trendTotal / donationCountTotal : 0);
  const campaignSlices = payload.campaignDistribution.map((row, idx) => ({
    ...row,
    color: campaignPalette[idx % campaignPalette.length]
  }));
  const paymentSlices = payload.transactionTypeDistribution.map((row, idx) => ({
    ...row,
    color: paymentPalette[row.label] ?? campaignPalette[idx % campaignPalette.length]
  }));

  async function refreshDashboard(nextRange: AnalyticsRangeKey, nextLimit: 10 | 25 | 50 | 100) {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics/financial?range=${nextRange}&limit=${nextLimit}`);
      const data = await response.json();
      if (response.ok) {
        setPayload(data as FinancialAnalyticsPayload);
      }
    } finally {
      setLoading(false);
    }
  }

  async function onRangeChange(nextRange: AnalyticsRangeKey) {
    setRange(nextRange);
    await refreshDashboard(nextRange, rowLimit);
  }

  async function onRowLimitChange(nextLimit: 10 | 25 | 50 | 100) {
    setRowLimit(nextLimit);
    await refreshDashboard(range, nextLimit);
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

      {loading ? <p className="text-sm text-slate-500">Updating financial dashboard...</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <LineChart
            title={`Donations Trend (${formatCurrency(trendTotal)})`}
            yAxisLabel="Donation Total"
            xAxisLabel="Time"
            size="compact"
            onExpand={() => setExpandedReport("trendAmount")}
            series={[
              {
                name: "Donations",
                color: "#16A34A",
                points: payload.trend.map((point) => ({ label: point.label, y: point.y }))
              }
            ]}
          />
        </div>
        <div>
          <LineChart
            title={`Donations Count Trend (${donationCountTotal.toLocaleString()})`}
            yAxisLabel="Donation Count"
            xAxisLabel="Time"
            size="compact"
            onExpand={() => setExpandedReport("trendCount")}
            series={[
              {
                name: "Donation Count",
                color: "#2563EB",
                points: payload.donationCountTrend.map((point) => ({ label: point.label, y: point.y }))
              }
            ]}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <PieChart
            title="Fund Distribution"
            slices={campaignSlices}
            size="compact"
            onExpand={() => setExpandedReport("funds")}
            valueFormatter={(value) => formatCurrency(value)}
          />
        </div>
        <div>
          <PieChart
            title="Transaction Type Distribution"
            slices={paymentSlices}
            size="compact"
            onExpand={() => setExpandedReport("types")}
            valueFormatter={(value) => formatCurrency(value)}
          />
        </div>
        <section className="flex h-[240px] flex-col justify-between rounded-md border border-slate-200 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Average Donation Amount</p>
            <p className="mt-1 text-xs text-slate-500">
              Total Donation Amount / Number of Donations for selected range
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-900">{formatCurrency(averageDonationAmount)}</p>
            <p className="mt-2 text-xs text-slate-500">
              Based on {donationCountTotal.toLocaleString()} donation
              {donationCountTotal === 1 ? "" : "s"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <p className="uppercase tracking-wide text-slate-500">Total Amount</p>
              <p className="text-sm font-medium text-slate-900">{formatCurrency(trendTotal)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <p className="uppercase tracking-wide text-slate-500">Donation Count</p>
              <p className="text-sm font-medium text-slate-900">{donationCountTotal.toLocaleString()}</p>
            </div>
          </div>
        </section>
      </div>

      {expandedReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-[96vw] max-w-[1400px] rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">
                {expandedReport === "trendAmount"
                  ? "Donations Trend (Expanded)"
                  : expandedReport === "trendCount"
                    ? "Donations Count Trend (Expanded)"
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
            {expandedReport === "trendAmount" ? (
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
            ) : expandedReport === "trendCount" ? (
              <LineChart
                title={`Donations Count Trend (${donationCountTotal.toLocaleString()})`}
                yAxisLabel="Donation Count"
                xAxisLabel="Time"
                size="expanded"
                series={[
                  {
                    name: "Donation Count",
                    color: "#2563EB",
                    points: payload.donationCountTrend.map((point) => ({ label: point.label, y: point.y }))
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
          <h3 className="text-sm font-semibold text-slate-900">Recent Transactions (Latest {rowLimit})</h3>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="financial-row-limit">
              Rows
            </label>
            <select
              id="financial-row-limit"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              value={rowLimit}
              onChange={(event) => void onRowLimitChange(Number(event.target.value) as 10 | 25 | 50 | 100)}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <Link href="/staff/financial/donations" className="text-xs font-medium text-brand-700">
              View All Donations
            </Link>
          </div>
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
