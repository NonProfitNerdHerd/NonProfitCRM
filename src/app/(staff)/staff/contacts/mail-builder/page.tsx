import { Card, CardHeader } from "@/components/ui/card";
import { MailBuilderWizard } from "@/components/contacts/mail-builder-wizard";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ContactsMailBuilderPage() {
  await requireStaffPermission("can_view_contacts");

  return (
    <Card>
      <CardHeader
        title="Mail Builder"
        subtitle="Create mailing lists from contacts and export merged letters or labels."
      />
      <MailBuilderWizard />
    </Card>
  );
}
