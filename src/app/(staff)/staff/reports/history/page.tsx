import { Card, CardHeader } from "@/components/ui/card";
import { ReportHistoryTable } from "@/components/reports/report-history-table";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ReportHistoryPage() {
  await requireStaffPermission("can_run_reports");

  return (
    <Card>
      <CardHeader
        title="Report History"
        subtitle="Review and download report outputs generated in the last 30 days."
      />
      <ReportHistoryTable />
    </Card>
  );
}
