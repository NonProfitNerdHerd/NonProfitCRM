import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";

export default async function ContactsPage() {
  await requireStaffPermission("can_view_contacts");
  const contacts = await listContacts("contacts");

  return (
    <Card>
      <CardHeader
        title="Contacts"
        subtitle="People with tracking status Lead or Non-Lead"
      />
      <ContactsList
        title="Contacts"
        subtitle="Entity Type: Person • Tracking Status: Lead/Non-Lead"
        contacts={contacts as Array<Record<string, unknown>>}
      />
    </Card>
  );
}
