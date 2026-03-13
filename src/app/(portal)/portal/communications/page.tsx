import { Card, CardHeader } from "@/components/ui/card";
import { listPortalCommunications, listPortalNotifications } from "@/lib/data/activity";
import { formatDate } from "@/lib/utils";

export default async function PortalCommunicationsPage() {
  const [communications, notifications] = await Promise.all([
    listPortalCommunications(),
    listPortalNotifications()
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader
          title="Communication History"
          subtitle="Portal-visible communication summaries"
        />
        <div className="space-y-3">
          {communications.map((item) => (
            <article className="rounded-md border border-slate-200 p-3 text-sm" key={item.id}>
              <p className="font-medium text-slate-900">{item.subject ?? item.channel}</p>
              <p className="mt-1 text-slate-700">{item.summary ?? "-"}</p>
              <p className="mt-2 text-xs text-slate-500">{formatDate(item.sent_at)}</p>
            </article>
          ))}
          {communications.length === 0 ? (
            <p className="text-sm text-slate-500">No communications available.</p>
          ) : null}
        </div>
      </Card>
      <Card>
        <CardHeader title="Notifications" subtitle="Recent constituent notifications" />
        <div className="space-y-3">
          {notifications.map((item) => (
            <article className="rounded-md border border-slate-200 p-3 text-sm" key={item.id}>
              <p className="font-medium text-slate-900">{item.title}</p>
              <p className="mt-1 text-slate-700">{item.body}</p>
              <p className="mt-2 text-xs text-slate-500">{formatDate(item.created_at)}</p>
            </article>
          ))}
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-500">No notifications available.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
