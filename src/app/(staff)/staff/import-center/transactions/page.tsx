import { Card, CardHeader } from "@/components/ui/card";
import { requireImportCenterAccess } from "@/lib/auth/guards";
import { TransactionsImportWizard } from "@/components/import-center/transactions-import-wizard";

export default async function TransactionsImportPage() {
  await requireImportCenterAccess();

  return (
    <Card>
      <CardHeader
        title="Transactions Import"
        subtitle="Import donations/transactions from CSV or Excel, match to contacts, and map campaigns."
      />
      <TransactionsImportWizard />
    </Card>
  );
}
