import { Card, CardHeader } from "@/components/ui/card";
import { ConstituentReportBuilder } from "@/components/reports/constituent-report-builder";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ReportBuilderPage() {
  await requireStaffPermission("can_run_reports");
  await requireStaffPermission("can_view_contacts");

  return (
    <Card>
      <CardHeader
        title="Report Builder"
        subtitle="Build constituent reports with guided filters, field selection, and export."
      />
      <ConstituentReportBuilder />
    </Card>
  );
}
