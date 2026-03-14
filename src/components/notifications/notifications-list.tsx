"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string | null;
  body: string | null;
  status: string | null;
  created_at: string;
  action_url: string | null;
};

export function NotificationsList({ initialItems }: { initialItems: NotificationItem[] }) {
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: "read" } : item)));
    router.refresh();
  }

  async function markAll() {
    setLoading(true);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" })
    });
    setItems((prev) => prev.map((item) => ({ ...item, status: "read" })));
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={markAll} disabled={loading}>
          {loading ? "Marking..." : "Mark all as read"}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No notifications yet.</p>
      ) : (
        items.map((item) => (
          <article
            key={item.id}
            className={`rounded-md border p-3 ${
              item.status === "unread" ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.title ?? "Notification"}</p>
                <p className="text-sm text-slate-700">{item.body ?? "-"}</p>
                <p className="text-xs text-slate-500">{formatDate(item.created_at)}</p>
              </div>
              <div className="flex gap-2">
                {item.action_url ? (
                  <Link
                    href={item.action_url}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                  >
                    Open
                  </Link>
                ) : null}
                {item.status === "unread" ? (
                  <button
                    type="button"
                    onClick={() => markRead(item.id)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
