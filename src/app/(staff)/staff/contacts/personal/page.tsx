import { Card, CardHeader } from "@/components/ui/card";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";

export default async function PersonalContactsPage() {
  const contacts = await listContacts("personal");

  return (
    <Card>
      <CardHeader
        title="Personal Contacts"
        subtitle="Individual donor and member profiles"
      />
      <ContactsList
        title="Personal Contacts"
        subtitle="Showing personal profiles only"
        contacts={contacts as Array<Record<string, unknown>>}
      />
    </Card>
  );
}
