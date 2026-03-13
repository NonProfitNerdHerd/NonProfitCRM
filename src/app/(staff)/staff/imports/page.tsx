import { Card, CardHeader } from "@/components/ui/card";
import { ImportForm } from "@/components/forms/import-form";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ImportsPage() {
  await requireStaffPermission("can_manage_imports");

  return (
    <Card>
      <CardHeader
        title="Imports & Migrations"
        subtitle="CSV import pipeline with source mapping, idempotency, and audit lineage"
      />
      <ImportForm />
    </Card>
  );
}
