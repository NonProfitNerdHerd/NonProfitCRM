import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import {
  getPlatformDashboardRollup,
  getPlatformSummary,
  listTenants,
  type PlatformDashboardRollup
} from "@/lib/data/platform-admin";
import { LineChart } from "@/components/analytics/line-chart";
import { formatCurrency } from "@/lib/utils";

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function roleLabel(roleKey: string) {
  const labels: Record<string, string> = {
    administrator: "Administrator",
    data_administrator: "Data Administrator",
    data_steward: "Data Steward",
    executive_staff: "Executive Staff",
    staff_pii: "Staff PII Access",
    staff_non_pii: "Staff Non-PII Access",
    data_entry: "Data Entry",
    volunteer: "Volunteer"
  };
  return labels[roleKey] ?? titleCase(roleKey);
}

function trendDisplayLabel(label: string) {
  const labels: Record<string, string> = {
    last_30_days: "Last 30 Days",
    last_60_days: "Last 60 Days",
    last_90_days: "Last 90 Days",
    last_120_days: "Last 120 Days",
    last_1_year: "Last 1 Year",
    last_3_years: "Last 3 Years",
    last_5_years: "Last 5 Years",
    last_10_years: "Last 10 Years"
  };
  return labels[label] ?? titleCase(label);
}

export default async function PlatformAdminDashboardPage() {
  await requirePlatformAdminAccess();
  const [summary, recentTenants, rollupRaw] = await Promise.all([
    getPlatformSummary(),
    listTenants({ sortBy: "created_at", sortDir: "desc" }),
    getPlatformDashboardRollup()
  ]);
  const rollup = rollupRaw as PlatformDashboardRollup;

  const cards = [
    { label: "Total Tenants", value: summary.totalTenants },
    { label: "Active Tenants", value: summary.activeTenants },
    { label: "Draft Tenants", value: summary.draftTenants },
    { label: "Suspended Tenants", value: summary.suspendedTenants },
    { label: "Open Restore Requests", value: summary.openRestoreRequests },
    { label: "Stale Backups (48h+)", value: summary.staleBackups }
  ];
  const trendPoints = rollup.tenantStats.donationTrend.map((entry) => ({
    label: trendDisplayLabel(entry.label)
      .replace("Last ", "")
      .replace(" Days", "D")
      .replace(" Years", "Y"),
    y: entry.amount
  }));

  return (
    <Card>
      <CardHeader
        title="Platform Administration"
        subtitle="Control plane for tenant provisioning, backup tiers, and tenant-level restore workflows."
      />
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Platform-Wide Tenant Stats (All Organizations)</p>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Donors" value={rollup.tenantStats.donors} />
            <StatCard label="Contacts" value={rollup.tenantStats.contacts} />
            <StatCard label="Donor Organizations" value={rollup.tenantStats.donorOrganizations} />
            <StatCard label="Organizations" value={rollup.tenantStats.organizations} />
            <StatCard label="Active Campaigns" value={rollup.tenantStats.activeCampaigns} />
            <StatCard label="Total Users" value={rollup.tenantStats.totalUsers} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <LineChart
              title={`Total Raised Trend (${formatCurrency(
                trendPoints[trendPoints.length - 1]?.y ?? 0
              )} in 10Y)`}
              yAxisLabel="Amount Raised"
              xAxisLabel="Rolling Window"
              series={[
                {
                  name: "Amount Raised",
                  color: "#16A34A",
                  points: trendPoints
                }
              ]}
            />
            <div className="space-y-3">
              <CountTable
                title="Users by Role"
                rows={rollup.tenantStats.roleCounts.map((row) => ({
                  label: roleLabel(row.key),
                  value: row.count
                }))}
              />
              <div className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Raised by Window
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {rollup.tenantStats.donationTrend.map((entry) => (
                    <div key={entry.label} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">
                        {trendDisplayLabel(entry.label)}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {formatCurrency(entry.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Tenant Configuration (Aggregate)</p>
            <div className="grid gap-2 md:grid-cols-2">
              <StatCard label="Total Tenants" value={rollup.tenantConfiguration.totalTenants} />
              <StatCard label="Backup Tier Assigned" value={rollup.tenantConfiguration.backupTierAssignedCount} />
              <StatCard
                label="Backup Tier Unassigned"
                value={rollup.tenantConfiguration.backupTierUnassignedCount}
              />
            </div>
            <div className="mt-3 grid gap-3">
              <CountTable
                title="Status Distribution"
                rows={rollup.tenantConfiguration.statusCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
              <CountTable
                title="Plan Distribution"
                rows={rollup.tenantConfiguration.planCounts.map((row) => ({
                  label: row.key || "Unknown",
                  value: row.count
                }))}
              />
              <CountTable
                title="Onboarding Stage Distribution"
                rows={rollup.tenantConfiguration.onboardingStageCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Backup Status (Aggregate)</p>
            <div className="grid gap-2 md:grid-cols-2">
              <StatCard
                label="Tenants with Backup Metadata"
                value={rollup.backupStatus.tenantsWithBackupMetadata}
              />
              <StatCard
                label="Tenants without Backup Metadata"
                value={rollup.backupStatus.tenantsWithoutBackupMetadata}
              />
              <StatCard label="Stale Backups (48h+)" value={rollup.backupStatus.staleBackups} />
              <StatCard label="Backups Due Soon (24h)" value={rollup.backupStatus.backupDueSoon} />
            </div>
            <div className="mt-3">
              <CountTable
                title="Last Backup Status Distribution"
                rows={rollup.backupStatus.statusCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Restore Request Workflow (Aggregate)</p>
            <div className="grid gap-2 md:grid-cols-2">
              <StatCard label="Total Restore Requests" value={rollup.restoreRequestWorkflow.totalRequests} />
            </div>
            <div className="mt-3">
              <CountTable
                title="Request Status Distribution"
                rows={rollup.restoreRequestWorkflow.statusCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Snapshot History (Aggregate)</p>
            <div className="grid gap-2 md:grid-cols-2">
              <StatCard label="Total Snapshots" value={rollup.snapshotHistory.totalSnapshots} />
              <StatCard label="Expiring in 7 Days" value={rollup.snapshotHistory.expiringSnapshots7d} />
            </div>
            <div className="mt-3 grid gap-3">
              <CountTable
                title="Snapshot Status Distribution"
                rows={rollup.snapshotHistory.statusCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
              <CountTable
                title="Snapshot Type Distribution"
                rows={rollup.snapshotHistory.typeCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Restore History (Aggregate)</p>
            <div className="grid gap-2 md:grid-cols-2">
              <StatCard label="Total Restore Events" value={rollup.restoreHistory.totalRestores} />
            </div>
            <div className="mt-3 grid gap-3">
              <CountTable
                title="Outcome Distribution"
                rows={rollup.restoreHistory.outcomeCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
              <CountTable
                title="Restore Target Distribution"
                rows={rollup.restoreHistory.targetCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Provisioning & Entitlements (Aggregate)</p>
            <div className="grid gap-2 md:grid-cols-2">
              <StatCard
                label="Total Provisioning Runs"
                value={rollup.provisioningAndEntitlements.totalProvisioningRuns}
              />
              <StatCard
                label="Enabled Entitlements"
                value={rollup.provisioningAndEntitlements.enabledEntitlementCount}
              />
              <StatCard
                label="Tenants with Entitlements"
                value={rollup.provisioningAndEntitlements.tenantsWithEnabledEntitlements}
              />
            </div>
            <div className="mt-3 grid gap-3">
              <CountTable
                title="Provisioning Run Status Distribution"
                rows={rollup.provisioningAndEntitlements.provisioningStatusCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
              <CountTable
                title="Enabled Module Distribution"
                rows={rollup.provisioningAndEntitlements.moduleCounts.map((row) => ({
                  label: titleCase(row.key),
                  value: row.count
                }))}
              />
            </div>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Recent Tenants</p>
            <Link
              href="/platform/admin/tenants"
              className="text-xs font-semibold text-brand-700 hover:text-brand-900"
            >
              Open Tenant Registry
            </Link>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2">Organization</th>
                  <th className="py-2">Slug</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Plan</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentTenants.slice(0, 10).map((tenant) => (
                  <tr key={String(tenant.id)} className="border-b border-slate-100">
                    <td className="py-2">
                      <Link
                        href={`/platform/admin/tenants/${String(tenant.id)}`}
                        className="font-medium text-brand-700 hover:text-brand-900"
                      >
                        {String(tenant.organization_name)}
                      </Link>
                    </td>
                    <td className="py-2">{String(tenant.slug)}</td>
                    <td className="py-2">{String(tenant.status)}</td>
                    <td className="py-2">{String(tenant.plan_package)}</td>
                    <td className="py-2">{String(tenant.created_at).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}

function CountTable({
  title,
  rows
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
}) {
  return (
    <section className="rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="max-h-48 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-1.5">Label</th>
              <th className="py-1.5 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.label} className="border-b border-slate-100">
                  <td className="py-1.5">{row.label}</td>
                  <td className="py-1.5 text-right">{row.value.toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-2 text-slate-400" colSpan={2}>
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
