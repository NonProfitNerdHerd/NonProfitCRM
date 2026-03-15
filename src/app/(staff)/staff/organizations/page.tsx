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
      <ContactsList
        title="Organizations"
        subtitle="Entity Type: Organization • Tracking Status: Lead/Non-Lead"
        contacts={contacts as Array<Record<string, unknown>>}
      />
    </Card>
  );
}
