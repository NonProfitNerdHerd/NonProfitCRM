"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/utils";

type TaskRelation =
  | Array<{ name?: string; first_name?: string; last_name?: string }>
  | { name?: string; first_name?: string; last_name?: string }
  | null
  | undefined;

type MyTaskRow = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  priority: string;
  completed_at: string | null;
  project_id: string | null;
  contacts?: TaskRelation;
  projects?: TaskRelation;
};

type TaskDashboardTab = "overdue" | "upcoming" | "completed" | "all" | "gantt" | "calendar";

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "todo", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" }
];

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toDateKey(value: Date) {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function taskStatusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "completed") return "bg-green-100 text-green-800";
  if (normalized === "blocked") return "bg-red-100 text-red-800";
  if (normalized === "cancelled") return "bg-slate-200 text-slate-700";
  if (normalized === "in_progress") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-800";
}

function relationName(value: TaskRelation) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return "-";
  if (typeof row.name === "string" && row.name) return row.name;
  const first = row.first_name ?? "";
  const last = row.last_name ?? "";
  const combined = `${first} ${last}`.trim();
  return combined || "-";
}

export function MyTasksDashboard({
  tasks,
  projects
}: {
  tasks: MyTaskRow[];
  projects: Array<{ id: string; name: string }>;
}) {
  const [activeTab, setActiveTab] = useState<TaskDashboardTab>("overdue");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    STATUS_FILTER_OPTIONS.map((option) => option.value)
  );
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const projectFilteredTasks = useMemo(() => {
    if (projectFilter === "all") return tasks;
    return tasks.filter((task) => task.project_id === projectFilter);
  }, [projectFilter, tasks]);

  const buckets = useMemo(() => {
    const today = startOfDay(new Date());
    const upcomingEnd = new Date(today);
    upcomingEnd.setDate(upcomingEnd.getDate() + 30);

    const completed = projectFilteredTasks.filter(
      (task) => task.status === "completed" || Boolean(task.completed_at)
    );
    const incomplete = projectFilteredTasks.filter(
      (task) => !(task.status === "completed" || Boolean(task.completed_at))
    );
    const overdue = incomplete.filter((task) => {
      const due = parseDate(task.due_date);
      return due ? startOfDay(due) < today : false;
    });
    const upcoming = incomplete.filter((task) => {
      const due = parseDate(task.due_date);
      if (!due) return false;
      const normalized = startOfDay(due);
      return normalized >= today && normalized <= upcomingEnd;
    });
    return {
      overdue,
      upcoming,
      completed,
      all: projectFilteredTasks
    };
  }, [projectFilteredTasks]);

  const rowsForTable = useMemo(() => {
    if (activeTab === "overdue") return buckets.overdue;
    if (activeTab === "upcoming") return buckets.upcoming;
    if (activeTab === "completed") return buckets.completed;
    return buckets.all;
  }, [activeTab, buckets]);

  const statusFilteredRows = useMemo(
    () => projectFilteredTasks.filter((task) => selectedStatuses.includes(task.status)),
    [projectFilteredTasks, selectedStatuses]
  );

  const ganttRows = useMemo(
    () =>
      statusFilteredRows
        .map((task) => {
          const start = parseDate(task.start_date) ?? parseDate(task.due_date);
          const end = parseDate(task.end_date) ?? parseDate(task.due_date) ?? start;
          if (!start || !end) return null;
          const normalizedStart = startOfDay(start);
          const normalizedEnd = startOfDay(end);
          return {
            task,
            start: normalizedStart,
            end: normalizedEnd >= normalizedStart ? normalizedEnd : normalizedStart
          };
        })
        .filter((row): row is { task: MyTaskRow; start: Date; end: Date } => Boolean(row))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [statusFilteredRows]
  );

  const ganttRange = useMemo(() => {
    if (ganttRows.length === 0) return null;
    const start = ganttRows.reduce(
      (min, row) => (row.start < min ? row.start : min),
      ganttRows[0].start
    );
    const end = ganttRows.reduce((max, row) => (row.end > max ? row.end : max), ganttRows[0].end);
    const paddedEnd = new Date(end);
    paddedEnd.setDate(paddedEnd.getDate() + 1);
    const spanMs = paddedEnd.getTime() - start.getTime();
    return { start, end: paddedEnd, spanMs: spanMs === 0 ? 24 * 60 * 60 * 1000 : spanMs };
  }, [ganttRows]);

  const calendarDays = useMemo(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

    const rows: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      rows.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  }, [calendarMonth]);

  const calendarMap = useMemo(() => {
    const map = new Map<string, MyTaskRow[]>();
    for (const row of statusFilteredRows) {
      const due = parseDate(row.due_date);
      if (!due) continue;
      const key = toDateKey(due);
      const existing = map.get(key) ?? [];
      existing.push(row);
      map.set(key, existing);
    }
    return map;
  }, [statusFilteredRows]);

  const showStatusFilter = activeTab === "gantt" || activeTab === "calendar";

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">My Tasks</h3>
            <p className="text-sm text-slate-600">
              Track your tasks by urgency, timeline, and schedule view.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-slate-700">
              Project
              <select
                className="ml-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
              >
                <option value="all">All Projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            {showStatusFilter ? (
              <StatusMultiSelect
                selected={selectedStatuses}
                onChange={setSelectedStatuses}
                options={STATUS_FILTER_OPTIONS}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <TaskTabButton
            active={activeTab === "overdue"}
            onClick={() => setActiveTab("overdue")}
            label={`Overdue (${buckets.overdue.length})`}
          />
          <TaskTabButton
            active={activeTab === "upcoming"}
            onClick={() => setActiveTab("upcoming")}
            label={`Upcoming (${buckets.upcoming.length})`}
          />
          <TaskTabButton
            active={activeTab === "completed"}
            onClick={() => setActiveTab("completed")}
            label={`Completed (${buckets.completed.length})`}
          />
          <TaskTabButton
            active={activeTab === "all"}
            onClick={() => setActiveTab("all")}
            label={`All Tasks (${buckets.all.length})`}
          />
          <TaskTabButton
            active={activeTab === "gantt"}
            onClick={() => setActiveTab("gantt")}
            label="Gantt Chart"
          />
          <TaskTabButton
            active={activeTab === "calendar"}
            onClick={() => setActiveTab("calendar")}
            label="Calendar View"
          />
        </div>
      </section>

      {activeTab === "gantt" ? (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          {ganttRows.length === 0 || !ganttRange ? (
            <p className="text-sm text-slate-500">No tasks available for the selected status filter.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Timeline: {formatDate(ganttRange.start)} - {formatDate(ganttRange.end)}
              </p>
              {ganttRows.map((row) => {
                const left =
                  ((row.start.getTime() - ganttRange.start.getTime()) / ganttRange.spanMs) * 100;
                const width =
                  (((row.end.getTime() - row.start.getTime()) / ganttRange.spanMs) * 100 || 0) + 2;
                return (
                  <div key={row.task.id} className="grid items-center gap-2 md:grid-cols-[260px_1fr]">
                    <Link href={`/staff/tasks/${row.task.id}`} className="text-sm font-medium text-brand-700">
                      {row.task.title}
                    </Link>
                    <div className="relative h-8 rounded-md border border-slate-200 bg-slate-50">
                      <div
                        className={`absolute top-1/2 h-4 -translate-y-1/2 rounded ${taskStatusTone(row.task.status)}`}
                        style={{
                          left: `${Math.max(0, Math.min(98, left))}%`,
                          width: `${Math.max(2, Math.min(100 - left, width))}%`
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "calendar" ? (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              onClick={() =>
                setCalendarMonth(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                )
              }
            >
              Previous
            </button>
            <p className="text-sm font-semibold text-slate-900">
              {calendarMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              onClick={() =>
                setCalendarMonth(
                  (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                )
              }
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const key = toDateKey(day);
              const rows = calendarMap.get(key) ?? [];
              const inMonth = day.getMonth() === calendarMonth.getMonth();
              return (
                <div
                  key={key}
                  className={`min-h-[95px] rounded-md border p-2 ${
                    inMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <p className={`text-xs ${inMonth ? "text-slate-700" : "text-slate-400"}`}>{day.getDate()}</p>
                  <div className="mt-1 space-y-1">
                    {rows.slice(0, 2).map((task) => (
                      <Link
                        key={task.id}
                        href={`/staff/tasks/${task.id}`}
                        className={`block truncate rounded px-1 py-0.5 text-[11px] ${taskStatusTone(task.status)}`}
                        title={task.title}
                      >
                        {task.title}
                      </Link>
                    ))}
                    {rows.length > 2 ? (
                      <p className="text-[11px] text-slate-500">+{rows.length - 2} more</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab !== "gantt" && activeTab !== "calendar" ? (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          {rowsForTable.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks in this view.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Task</th>
                    <th className="py-2">Project</th>
                    <th className="py-2">Contact</th>
                    <th className="py-2">Due Date</th>
                    <th className="py-2">Priority</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForTable.map((task) => (
                    <tr key={task.id} className="border-b border-slate-100">
                      <td className="py-2">
                        <Link href={`/staff/tasks/${task.id}`} className="font-medium text-brand-700">
                          {task.title}
                        </Link>
                      </td>
                      <td className="py-2">{relationName(task.projects)}</td>
                      <td className="py-2">{relationName(task.contacts)}</td>
                      <td className="py-2">{formatDate(task.due_date)}</td>
                      <td className="py-2">{task.priority || "-"}</td>
                      <td className="py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${taskStatusTone(task.status)}`}>
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function TaskTabButton({
  active,
  onClick,
  label
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
        active
          ? "border-brand-200 bg-brand-100 text-brand-800"
          : "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function StatusMultiSelect({
  options,
  selected,
  onChange
}: {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(value: string) {
    if (selected.includes(value)) {
      const next = selected.filter((entry) => entry !== value);
      onChange(next.length > 0 ? next : selected);
      return;
    }
    onChange([...selected, value]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
        onClick={() => setOpen((prev) => !prev)}
      >
        Statuses ({selected.length})
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="text-[11px] text-brand-700"
              onClick={() => onChange(options.map((option) => option.value))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-[11px] text-slate-600"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
          <div className="space-y-1">
            {options.map((option) => (
              <label key={option.value} className="flex items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
