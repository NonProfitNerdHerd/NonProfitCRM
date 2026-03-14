import { Card, CardHeader } from "@/components/ui/card";
import { ReportBuilder } from "@/components/reports/report-builder";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ContactReportsPage() {
  await requireStaffPermission("can_run_reports");
  await requireStaffPermission("can_view_contacts");

  return (
    <Card>
      <CardHeader
        title="Contact Reports"
        subtitle="Preconfigured contact reporting with dynamic customization and export."
      />
      <ReportBuilder
        initialReportType="contacts"
        hideReportTypeSelector
        title="Contact Reporting"
        subtitle="Analyze contact, donor, and membership profile data."
      />
    </Card>
  );
}
