import { Card, CardHeader } from "@/components/ui/card";
import { ReportBuilder } from "@/components/reports/report-builder";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ProjectReportsPage() {
  await requireStaffPermission("can_run_reports");
  await requireStaffPermission("can_view_dashboard");

  return (
    <Card>
      <CardHeader
        title="Project Reports"
        subtitle="Track project status, manager assignments, and task rollup health."
      />
      <ReportBuilder
        initialReportType="projects"
        title="Project Reporting"
        subtitle="Project and task execution reporting for operational planning."
      />
    </Card>
  );
}
