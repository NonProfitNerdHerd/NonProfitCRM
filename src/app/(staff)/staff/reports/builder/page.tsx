import { Card, CardHeader } from "@/components/ui/card";
import { ReportBuilder } from "@/components/reports/report-builder";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ReportBuilderPage() {
  await requireStaffPermission("can_run_reports");

  return (
    <Card>
      <CardHeader
        title="Report Builder"
        subtitle="Build custom reports with dynamic columns, filters, sorting, and exports."
      />
      <ReportBuilder />
    </Card>
  );
}
