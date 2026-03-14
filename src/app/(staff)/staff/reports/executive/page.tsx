import { Card, CardHeader } from "@/components/ui/card";
import { ExecutiveReportsDashboard } from "@/components/reports/executive-reports-dashboard";
import { getExecutiveReportsData } from "@/lib/data/executive-reports";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ExecutiveReportsPage() {
  await requireStaffPermission("can_run_reports");
  await requireStaffPermission("can_view_financial_summaries");
  const data = await getExecutiveReportsData();

  return (
    <Card className="print:shadow-none print:border-none print:p-0">
      <CardHeader
        title="Executive Reports"
        subtitle="Printable board-ready dashboard for high-level organizational reporting."
      />
      <ExecutiveReportsDashboard data={data} />
    </Card>
  );
}
