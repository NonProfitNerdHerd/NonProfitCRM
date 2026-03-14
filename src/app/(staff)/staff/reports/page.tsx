import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { SavedReportsLibrary } from "@/components/reports/saved-reports-library";

export default async function ReportsPage() {
  await requireStaffPermission("can_run_reports");

  return (
    <Card>
      <CardHeader
        title="Saved Reports"
        subtitle="Browse, filter, and reopen previously saved report definitions."
      />
      <SavedReportsLibrary />
    </Card>
  );
}
