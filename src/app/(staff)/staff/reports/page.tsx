import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import Link from "next/link";

export default async function ReportsPage() {
  await requireStaffPermission("can_run_reports");

  const entries = [
    { href: "/staff/reports/builder", label: "Report Builder", description: "Unified dynamic report builder" },
    { href: "/staff/reports/contacts", label: "Contact Reports", description: "Contact and household reporting" },
    { href: "/staff/reports/campaigns", label: "Campaign Reports", description: "Campaign funding and acknowledgements" },
    { href: "/staff/reports/donors", label: "Donor Reports", description: "Giving and donor lifecycle reporting" },
    { href: "/staff/reports/projects", label: "Project Reports", description: "Project and task rollups" },
    { href: "/staff/reports/memberships", label: "Membership Reports", description: "Membership lifecycle and renewals" },
    { href: "/staff/reports/executive", label: "Executive Reports", description: "Printable executive dashboards" }
  ];

  return (
    <Card>
      <CardHeader
        title="Reports"
        subtitle="Unified report builder, category entry points, and executive dashboards"
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="rounded-md border border-slate-200 p-4 transition hover:bg-slate-50"
          >
            <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
            <p className="text-xs text-slate-600">{entry.description}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}
