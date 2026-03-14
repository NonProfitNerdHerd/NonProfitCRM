import { Card, CardHeader } from "@/components/ui/card";
import { ImportWizard } from "@/components/imports/import-wizard";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ImportsPage() {
  await requireStaffPermission("can_manage_imports");

  return (
    <Card>
      <CardHeader
        title="Imports & Migrations"
        subtitle="Enterprise import wizard with staging, duplicate review, commit, and rollback."
      />
      <ImportWizard />
    </Card>
  );
}
