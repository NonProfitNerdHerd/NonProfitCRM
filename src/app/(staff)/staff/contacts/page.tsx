import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";

export default async function ContactsPage() {
  await requireStaffPermission("can_view_contacts");
  const contacts = await listContacts("all");

  return (
    <Card>
      <CardHeader
        title="All Contacts"
        subtitle="All person and organization records"
      />
      <ContactsList
        title="All Contacts"
        subtitle="Unfiltered directory of contacts"
        contacts={contacts as Array<Record<string, unknown>>}
      />
    </Card>
  );
}
