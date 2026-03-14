"use client";

import { LineChart } from "@/components/analytics/line-chart";

type TrendPoint = { label: string; y: number };

type ExecutiveReportsData = {
  generatedAt: string;
  donationGrowth: TrendPoint[];
  contactGrowth: TrendPoint[];
  donorGrowth: TrendPoint[];
  membershipGrowth: TrendPoint[];
  activeCampaignSummary: {
    totalCampaigns: number;
    activeCampaigns: number;
  };
  projectStatusSummary: Record<string, number>;
};

export function ExecutiveReportsDashboard({ data }: { data: ExecutiveReportsData }) {
  const completedProjects = Object.entries(data.projectStatusSummary).reduce(
    (sum, [status, count]) =>
      status.toLowerCase().includes("complete") ? sum + Number(count ?? 0) : sum,
    0
  );
  const totalProjects = Object.values(data.projectStatusSummary).reduce(
    (sum, count) => sum + Number(count ?? 0),
    0
  );
  const activeProjects = Math.max(0, totalProjects - completedProjects);

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-xs text-slate-500">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </p>
        <button
          type="button"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => window.print()}
        >
          Print Executive Dashboard
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">Total Campaigns</p>
          <p className="text-2xl font-semibold text-slate-900">
            {data.activeCampaignSummary.totalCampaigns}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">Active Campaigns</p>
          <p className="text-2xl font-semibold text-slate-900">
            {data.activeCampaignSummary.activeCampaigns}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">Total Projects</p>
          <p className="text-2xl font-semibold text-slate-900">{totalProjects}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">Active Projects</p>
          <p className="text-2xl font-semibold text-slate-900">{activeProjects}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <LineChart
          title="Growth in Donations"
          yAxisLabel="Donations"
          xAxisLabel="Month"
          size="compact"
          series={[{ name: "Donations", color: "#0284C7", points: data.donationGrowth }]}
        />
        <LineChart
          title="Growth in Contacts"
          yAxisLabel="Contacts"
          xAxisLabel="Month"
          size="compact"
          series={[{ name: "Contacts", color: "#16A34A", points: data.contactGrowth }]}
        />
        <LineChart
          title="Growth in Donors"
          yAxisLabel="Donors"
          xAxisLabel="Month"
          size="compact"
          series={[{ name: "Donors", color: "#7C3AED", points: data.donorGrowth }]}
        />
        <LineChart
          title="Membership Growth"
          yAxisLabel="Memberships"
          xAxisLabel="Month"
          size="compact"
          series={[{ name: "Memberships", color: "#D97706", points: data.membershipGrowth }]}
        />
      </div>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Project Status Summary</h4>
        {Object.keys(data.projectStatusSummary).length === 0 ? (
          <p className="text-sm text-slate-500">No project status data available.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-3">
            {Object.entries(data.projectStatusSummary).map(([status, count]) => (
              <div key={status} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">{status}</p>
                <p className="text-xl font-semibold text-slate-900">{count}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
