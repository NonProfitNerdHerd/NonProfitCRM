import { Card, CardHeader } from "@/components/ui/card";
import { listPortalDonations } from "@/lib/data/donations";
import { listPortalMemberships } from "@/lib/data/memberships";
import { listPortalNotifications } from "@/lib/data/activity";

export default async function PortalDashboardPage() {
  const [donations, memberships, notifications] = await Promise.all([
    listPortalDonations(),
    listPortalMemberships(),
    listPortalNotifications()
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader title="Donation History" subtitle="Lifetime recorded gifts" />
        <p className="text-3xl font-semibold">{donations.length}</p>
      </Card>
      <Card>
        <CardHeader title="Memberships" subtitle="Current and prior memberships" />
        <p className="text-3xl font-semibold">{memberships.length}</p>
      </Card>
      <Card>
        <CardHeader title="Notifications" subtitle="Portal-visible updates" />
        <p className="text-3xl font-semibold">{notifications.length}</p>
      </Card>
    </div>
  );
}
