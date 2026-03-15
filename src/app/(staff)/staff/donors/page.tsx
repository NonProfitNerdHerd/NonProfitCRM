import { Card, CardHeader } from "@/components/ui/card";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";

export default async function DonorsPage() {
  const contacts = await listContacts("donors");

  return (
    <Card>
      <CardHeader
        title="Donors"
        subtitle="People with tracking status Donor"
      />
      <ContactsList
        title="Donors"
        subtitle="Entity Type: Person • Tracking Status: Donor"
        contacts={contacts as Array<Record<string, unknown>>}
      />
    </Card>
  );
}
