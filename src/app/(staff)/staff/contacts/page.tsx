import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";
import { getContactAnalytics } from "@/lib/data/analytics";
import { ContactsAnalyticsDashboard } from "@/components/contacts/contacts-analytics-dashboard";

export default async function ContactsPage() {
  await requireStaffPermission("can_view_contacts");
  const [contacts, analytics] = await Promise.all([listContacts("all"), getContactAnalytics("30d")]);

  return (
    <Card>
      <CardHeader
        title="All Contacts"
        subtitle="All person and organization records"
      />
      <ContactsAnalyticsDashboard initial={analytics} />
      <div className="pt-3">
        <ContactsList contacts={contacts as Array<Record<string, unknown>>} mode="all" />
      </div>
    </Card>
  );
}
