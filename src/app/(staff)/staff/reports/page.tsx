import { Card, CardHeader } from "@/components/ui/card";
import { ReportBuilderForm } from "@/components/forms/report-builder-form";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ReportsPage() {
  await requireStaffPermission("can_run_reports");

  return (
    <Card>
      <CardHeader
        title="Reporting & Exports"
        subtitle="Permission-aware report builder with PII and export governance"
      />
      <ReportBuilderForm />
    </Card>
  );
}
