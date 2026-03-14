import { Card, CardHeader } from "@/components/ui/card";
import { ReportBuilder } from "@/components/reports/report-builder";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function CampaignReportsPage() {
  await requireStaffPermission("can_run_reports");
  await requireStaffPermission("can_view_donations");

  return (
    <Card>
      <CardHeader
        title="Campaign Reports"
        subtitle="Track campaign performance, funding distribution, and pending acknowledgements."
      />
      <ReportBuilder
        initialReportType="campaigns"
        title="Campaign Reporting"
        subtitle="Campaign-level fundraising and acknowledgement reporting."
      />
    </Card>
  );
}
