import { Card, CardHeader } from "@/components/ui/card";
import { ReportBuilder } from "@/components/reports/report-builder";
import { requireStaffPermission } from "@/lib/auth/guards";

type PageProps = {
  searchParams: Promise<{
    savedReportId?: string;
    reportType?: string;
  }>;
};

export default async function CreateReportPage({ searchParams }: PageProps) {
  await requireStaffPermission("can_run_reports");
  const params = await searchParams;

  return (
    <Card>
      <CardHeader
        title="Report Builder"
        subtitle="Guided report creation with steps for fields, filters, and results."
      />
      <ReportBuilder
        initialSavedReportId={params.savedReportId}
        initialReportType={
          params.reportType as "contacts" | "campaigns" | "donors" | "projects" | "memberships"
        }
      />
    </Card>
  );
}
