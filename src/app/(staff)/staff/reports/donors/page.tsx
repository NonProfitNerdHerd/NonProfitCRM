import { Card, CardHeader } from "@/components/ui/card";
import { ReportBuilder } from "@/components/reports/report-builder";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function DonorReportsPage() {
  await requireStaffPermission("can_run_reports");
  await requireStaffPermission("can_view_donations");

  return (
    <Card>
      <CardHeader
        title="Donor Reports"
        subtitle="Analyze donor giving history, segmentation, and acknowledgement status."
      />
      <ReportBuilder
        initialReportType="donors"
        title="Donor Reporting"
        subtitle="Gift trends, donor retention, and acknowledgement follow-up."
      />
    </Card>
  );
}
