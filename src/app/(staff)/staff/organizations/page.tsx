import { Card, CardHeader } from "@/components/ui/card";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";

export default async function OrganizationsPage() {
  const contacts = await listContacts("organizations");

  return (
    <Card>
      <CardHeader
        title="Organizations"
        subtitle="Organizations with tracking status Lead or Non-Lead"
      />
      <ContactsList contacts={contacts as Array<Record<string, unknown>>} mode="organizations" />
    </Card>
  );
}
