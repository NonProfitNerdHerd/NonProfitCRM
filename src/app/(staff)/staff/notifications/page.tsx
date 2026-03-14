import { Card, CardHeader } from "@/components/ui/card";
import { listMyNotifications } from "@/lib/data/notifications";
import {
  NotificationsList,
  type NotificationItem
} from "@/components/notifications/notifications-list";

export default async function NotificationsPage() {
  const notifications = await listMyNotifications();

  return (
    <Card>
      <CardHeader
        title="Notifications"
        subtitle="Task assignment, mentions, and project updates for your account"
      />
      <NotificationsList initialItems={notifications as NotificationItem[]} />
    </Card>
  );
}
