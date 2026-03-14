"use client";

import { useState } from "react";
import {
  MyTasksTabs,
  type MyTaskBuckets
} from "@/components/dashboard/my-tasks-tabs";
import {
  NotificationsList,
  type NotificationItem
} from "@/components/notifications/notifications-list";

export function DashboardTabs({
  buckets,
  projects,
  notifications
}: {
  buckets: MyTaskBuckets;
  projects: Array<{ id: string; name: string }>;
  notifications: NotificationItem[];
}) {
  const [activeTab, setActiveTab] = useState<"tasks" | "notifications">("tasks");

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("tasks")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            activeTab === "tasks" ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-700"
          }`}
        >
          My Tasks
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("notifications")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            activeTab === "notifications"
              ? "bg-brand-100 text-brand-800"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          Notifications
        </button>
      </div>

      {activeTab === "tasks" ? (
        <MyTasksTabs buckets={buckets} projects={projects} />
      ) : (
        <NotificationsList initialItems={notifications} />
      )}
    </div>
  );
}
