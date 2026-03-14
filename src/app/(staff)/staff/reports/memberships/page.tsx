import { Card, CardHeader } from "@/components/ui/card";
import { ReportBuilder } from "@/components/reports/report-builder";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function MembershipReportsPage() {
  await requireStaffPermission("can_run_reports");
  await requireStaffPermission("can_view_member_records");

  return (
    <Card>
      <CardHeader
        title="Membership Reports"
        subtitle="Monitor membership status, renewals, and upcoming expirations."
      />
      <ReportBuilder
        initialReportType="memberships"
        title="Membership Reporting"
        subtitle="Membership lifecycle reporting and renewal operations."
      />
    </Card>
  );
}
