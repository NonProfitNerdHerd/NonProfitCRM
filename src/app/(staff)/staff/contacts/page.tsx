import { Card, CardHeader } from "@/components/ui/card";
import { getContactAnalytics } from "@/lib/data/analytics";
import { ContactsAnalyticsDashboard } from "@/components/contacts/contacts-analytics-dashboard";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function ContactsPage() {
  await requireStaffPermission("can_view_contacts");
  const analytics = await getContactAnalytics("30d");

  return (
    <Card>
      <CardHeader
        title="Contacts Analytics"
        subtitle="Trend views for personal and organizational contact growth"
      />
      <ContactsAnalyticsDashboard initial={analytics} />
    </Card>
  );
}
