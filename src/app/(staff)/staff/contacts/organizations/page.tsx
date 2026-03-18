import { Card, CardHeader } from "@/components/ui/card";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";

export default async function OrganizationalContactsPage() {
  const contacts = await listContacts("organizations");

  return (
    <Card>
      <CardHeader
        title="Organizational Contacts"
        subtitle="Contact records associated with organizations"
      />
      <ContactsList contacts={contacts as Array<Record<string, unknown>>} />
    </Card>
  );
}
