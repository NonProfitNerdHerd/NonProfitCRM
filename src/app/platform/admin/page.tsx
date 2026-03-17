import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { getPlatformSummary, listTenants } from "@/lib/data/platform-admin";

export default async function PlatformAdminDashboardPage() {
  await requirePlatformAdminAccess();
  const [summary, recentTenants] = await Promise.all([
    getPlatformSummary(),
    listTenants({ sortBy: "created_at", sortDir: "desc" })
  ]);

  const cards = [
    { label: "Total Tenants", value: summary.totalTenants },
    { label: "Active Tenants", value: summary.activeTenants },
    { label: "Draft Tenants", value: summary.draftTenants },
    { label: "Suspended Tenants", value: summary.suspendedTenants },
    { label: "Open Restore Requests", value: summary.openRestoreRequests },
    { label: "Stale Backups (48h+)", value: summary.staleBackups }
  ];

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
