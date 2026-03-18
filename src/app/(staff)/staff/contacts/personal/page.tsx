import { Card, CardHeader } from "@/components/ui/card";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";

export default async function PersonalContactsPage() {
  const contacts = await listContacts("contacts");

  return (
    <Card>
      <CardHeader
        title="Contacts"
        subtitle="People with tracking status Lead or Non-Lead"
      />
      <ContactsList contacts={contacts as Array<Record<string, unknown>>} mode="contacts" />
    </Card>
  );
}
