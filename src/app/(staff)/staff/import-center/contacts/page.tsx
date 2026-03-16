import { Card, CardHeader } from "@/components/ui/card";
import { requireImportCenterAccess } from "@/lib/auth/guards";
import { ContactsImportWizard } from "@/components/import-center/contacts-import-wizard";

export default async function ContactsImportPage() {
  await requireImportCenterAccess();

  return (
    <Card>
      <CardHeader
        title="Contacts Import"
        subtitle="Import contacts from CSV/Excel with reusable mapping templates and tag parsing."
      />
      <ContactsImportWizard />
    </Card>
  );
}
