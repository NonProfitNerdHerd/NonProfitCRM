"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/utils";

export type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  project_id: string | null;
  assigned_to?: string | null;
  contacts?: Array<{ first_name: string; last_name: string }> | { first_name: string; last_name: string } | null;
  projects?: Array<{ name: string }> | { name: string } | null;
};

export type MyTaskBuckets = {
  overdue: TaskRecord[];
  upcoming: TaskRecord[];
  allTasks: TaskRecord[];
  recentlyCompleted: TaskRecord[];
};

export function MyTasksTabs({
  buckets,
  projects
}: {
  buckets: MyTaskBuckets;
  projects: Array<{ id: string; name: string }>;
}) {
  const [activeTab, setActiveTab] = useState<"overdue" | "upcoming" | "all" | "completed">(
    buckets.overdue.length > 0 ? "overdue" : buckets.upcoming.length > 0 ? "upcoming" : "all"
  );
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const filterRows = (rows: TaskRecord[]) =>
      projectFilter === "all" ? rows : rows.filter((row) => row.project_id === projectFilter);

    return {
      overdue: filterRows(buckets.overdue),
      upcoming: filterRows(buckets.upcoming),
      all: filterRows(buckets.allTasks),
      completed: filterRows(buckets.recentlyCompleted)
    };
  }, [buckets, projectFilter]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">My Tasks</h3>
          <p className="text-sm text-slate-600">
            Personalized task queue with overdue, upcoming, and recent completions.
          </p>
        </div>
        <select
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">All Projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {filtered.overdue.length > 0 ? (
          <TabButton
            label={`Overdue (${filtered.overdue.length})`}
            active={activeTab === "overdue"}
            onClick={() => setActiveTab("overdue")}
            tone="red"
          />
        ) : null}
        {filtered.upcoming.length > 0 ? (
          <TabButton
            label={`Upcoming (${filtered.upcoming.length})`}
            active={activeTab === "upcoming"}
            onClick={() => setActiveTab("upcoming")}
            tone="yellow"
          />
        ) : null}
        <TabButton
          label={`All Tasks (${filtered.all.length})`}
          active={activeTab === "all"}
          onClick={() => setActiveTab("all")}
        />
        <TabButton
          label={`Recently Completed (${filtered.completed.length})`}
          active={activeTab === "completed"}
          onClick={() => setActiveTab("completed")}
        />
      </div>

      <TaskRows
        rows={
          activeTab === "overdue"
            ? filtered.overdue
            : activeTab === "upcoming"
              ? filtered.upcoming
              : activeTab === "all"
                ? filtered.all
                : filtered.completed
        }
      />
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  tone = "default"
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "yellow" | "red";
}) {
  const base = "rounded-full px-3 py-1.5 text-xs font-semibold";
  const toneClass =
    tone === "red"
      ? active
        ? "bg-red-100 text-red-800"
        : "bg-red-50 text-red-700"
      : tone === "yellow"
        ? active
          ? "bg-amber-100 text-amber-800"
          : "bg-amber-50 text-amber-700"
        : active
          ? "bg-brand-100 text-brand-800"
          : "bg-slate-100 text-slate-700";

  return (
    <button type="button" className={`${base} ${toneClass}`} onClick={onClick}>
      {label}
    </button>
  );
}

function TaskRows({ rows }: { rows: TaskRecord[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No tasks in this bucket.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((task) => {
        const contact = Array.isArray(task.contacts) ? task.contacts[0] : task.contacts;
        const project = Array.isArray(task.projects) ? task.projects[0] : task.projects;
        return (
          <Link
            key={task.id}
            href={`/staff/tasks/${task.id}`}
            className="block rounded-md border border-slate-200 px-4 py-3 hover:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                <p className="text-xs text-slate-600">{task.description ?? "-"}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                {task.priority}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>Due: {formatDate(task.due_date)}</span>
              {contact ? (
                <span>
                  Contact: {contact.first_name} {contact.last_name}
                </span>
              ) : null}
              {project ? <span>Project: {project.name}</span> : null}
              <span>Assigned: {task.assigned_to ?? "-"}</span>
              <span>Status: {task.status}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
