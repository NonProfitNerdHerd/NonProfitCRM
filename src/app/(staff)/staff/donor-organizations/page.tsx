import { Card, CardHeader } from "@/components/ui/card";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";

export default async function DonorOrganizationsPage() {
  const contacts = await listContacts("donor_organizations");

  return (
    <Card>
      <CardHeader
        title="Donor Organizations"
        subtitle="Organizations with tracking status Donor"
      />
      <ContactsList
        title="Donor Organizations"
        subtitle="Entity Type: Organization • Tracking Status: Donor"
        contacts={contacts as Array<Record<string, unknown>>}
      />
    </Card>
  );
}
