"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/utils";

export type ProjectPortfolioRow = {
  id: string;
  name: string;
  status: string;
  project_start_date: string | null;
  expected_end_date: string | null;
  description: string | null;
};

export type PortfolioTaskRow = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  project_id: string | null;
  projects?: Array<{ name?: string }> | { name?: string } | null;
};

type PortfolioTab = "gantt" | "calendar" | "thirty_sixty_ninety";
type GanttScale = "week" | "month" | "year";

const ZOOM_DAY_OPTIONS = [30, 60, 90, 120, 180, 365] as const;

function toDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toDateKey(value: Date) {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function projectNameFromTask(task: PortfolioTaskRow) {
  const relation = Array.isArray(task.projects) ? task.projects[0] : task.projects;
  return String(relation?.name ?? "-");
}

function initialWindowStart(projects: ProjectPortfolioRow[]) {
  const dated = projects
    .map((project) => toDate(project.project_start_date))
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!dated.length) return startOfDay(new Date());
  return startOfDay(dated[0]);
}

export function ProjectsPortfolioGantt({
  projects,
  tasks
}: {
  projects: ProjectPortfolioRow[];
  tasks: PortfolioTaskRow[];
}) {
  const [activeTab, setActiveTab] = useState<PortfolioTab>("gantt");
  const [zoomDays, setZoomDays] = useState<number>(90);
  const [ganttScale, setGanttScale] = useState<GanttScale>("month");
  const [windowStart, setWindowStart] = useState<Date>(() => initialWindowStart(projects));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const projectRows = useMemo(
    () =>
      projects.map((project) => {
        const start = toDate(project.project_start_date);
        const end = toDate(project.expected_end_date);
        return {
          ...project,
          start,
          end: end && start && end < start ? start : end ?? start
        };
      }),
    [projects]
  );

  const windowRange = useMemo(() => {
    const start = startOfDay(windowStart);
    const end = new Date(start);
    end.setDate(end.getDate() + zoomDays);
    const spanMs = Math.max(24 * 60 * 60 * 1000, end.getTime() - start.getTime());
    return { start, end, spanMs };
  }, [windowStart, zoomDays]);

  const visibleBars = useMemo(() => {
    return projectRows
      .filter((row) => row.start && row.end && row.end >= windowRange.start && row.start <= windowRange.end)
      .map((row) => {
        const clampedStart = row.start! < windowRange.start ? windowRange.start : row.start!;
        const clampedEnd = row.end! > windowRange.end ? windowRange.end : row.end!;
        const left =
          ((clampedStart.getTime() - windowRange.start.getTime()) / windowRange.spanMs) * 100;
        const width =
          (((clampedEnd.getTime() - clampedStart.getTime()) / windowRange.spanMs) * 100 || 0) + 2;
        return { ...row, left, width };
      });
  }, [projectRows, windowRange]);

  const ganttTicks = useMemo(() => {
    const ticks: Array<{ left: number; label: string; key: string }> = [];
    const cursor = new Date(windowRange.start);
    if (ganttScale === "week") {
      cursor.setDate(cursor.getDate() - cursor.getDay());
    } else if (ganttScale === "month") {
      cursor.setDate(1);
    } else {
      cursor.setMonth(0, 1);
    }

    while (cursor <= windowRange.end) {
      const left =
        ((cursor.getTime() - windowRange.start.getTime()) / windowRange.spanMs) * 100;
      if (left >= 0 && left <= 100) {
        const label =
          ganttScale === "week"
            ? `Wk ${cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : ganttScale === "month"
              ? cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" })
              : cursor.toLocaleDateString("en-US", { year: "numeric" });
        ticks.push({
          left,
          label,
          key: `${ganttScale}-${cursor.toISOString()}`
        });
      }

      if (ganttScale === "week") {
        cursor.setDate(cursor.getDate() + 7);
      } else if (ganttScale === "month") {
        cursor.setMonth(cursor.getMonth() + 1, 1);
      } else {
        cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
      }
    }

    if (ticks.length === 0) {
      ticks.push({
        left: 0,
        label: formatDate(windowRange.start),
        key: `${ganttScale}-start`
      });
      ticks.push({
        left: 100,
        label: formatDate(windowRange.end),
        key: `${ganttScale}-end`
      });
    }

    return ticks;
  }, [ganttScale, windowRange]);

  const calendarDays = useMemo(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

    const days: Date[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [calendarMonth]);

  const projectCalendarMap = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string; kind: "start" | "end" }>>();
    for (const row of projectRows) {
      if (row.start) {
        const key = toDateKey(row.start);
        const existing = map.get(key) ?? [];
        existing.push({ id: row.id, name: row.name, kind: "start" });
        map.set(key, existing);
      }
      if (row.end) {
        const key = toDateKey(row.end);
        const existing = map.get(key) ?? [];
        existing.push({ id: row.id, name: row.name, kind: "end" });
        map.set(key, existing);
      }
    }
    return map;
  }, [projectRows]);

  const taskBuckets = useMemo(() => {
    const today = startOfDay(new Date());
    const days30 = new Date(today);
    days30.setDate(days30.getDate() + 30);
    const days60 = new Date(today);
    days60.setDate(days60.getDate() + 60);
    const days90 = new Date(today);
    days90.setDate(days90.getDate() + 90);

    const candidates = tasks.filter((task) => {
      const due = toDate(task.due_date);
      if (!due) return false;
      const status = String(task.status ?? "").toLowerCase();
      return !["completed", "cancelled"].includes(status);
    });

    const first = candidates.filter((task) => {
      const due = startOfDay(toDate(task.due_date)!);
      return due < today || due <= days30;
    });
    const second = candidates.filter((task) => {
      const due = startOfDay(toDate(task.due_date)!);
      return due > days30 && due <= days60;
    });
    const third = candidates.filter((task) => {
      const due = startOfDay(toDate(task.due_date)!);
      return due > days60 && due <= days90;
    });
    return { first, second, third };
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <TabButton active={activeTab === "gantt"} onClick={() => setActiveTab("gantt")}>
          Gantt Chart
        </TabButton>
        <TabButton active={activeTab === "calendar"} onClick={() => setActiveTab("calendar")}>
          Calendar View
        </TabButton>
        <TabButton active={activeTab === "thirty_sixty_ninety"} onClick={() => setActiveTab("thirty_sixty_ninety")}>
          30-60-90
        </TabButton>
      </div>

      {activeTab === "gantt" ? (
        <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Gantt timeline based on project start and expected end dates. Use zoom controls to adjust time scale.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">
              Window: {formatDate(windowRange.start)} - {formatDate(windowRange.end)}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <label className="mr-1 flex items-center gap-1 text-xs text-slate-700">
                Scale
                <select
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  value={ganttScale}
                  onChange={(event) => setGanttScale(event.target.value as GanttScale)}
                >
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </label>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() =>
                  setWindowStart((prev) => {
                    const next = new Date(prev);
                    next.setDate(next.getDate() - Math.max(1, Math.floor(zoomDays / 2)));
                    return next;
                  })
                }
              >
                Prev
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() => setWindowStart(startOfDay(new Date()))}
              >
                Today
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() =>
                  setWindowStart((prev) => {
                    const next = new Date(prev);
                    next.setDate(next.getDate() + Math.max(1, Math.floor(zoomDays / 2)));
                    return next;
                  })
                }
              >
                Next
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() => {
                  const index = ZOOM_DAY_OPTIONS.indexOf(zoomDays as (typeof ZOOM_DAY_OPTIONS)[number]);
                  if (index > 0) setZoomDays(ZOOM_DAY_OPTIONS[index - 1]);
                }}
              >
                Zoom In
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs"
                onClick={() => {
                  const index = ZOOM_DAY_OPTIONS.indexOf(zoomDays as (typeof ZOOM_DAY_OPTIONS)[number]);
                  if (index >= 0 && index < ZOOM_DAY_OPTIONS.length - 1) {
                    setZoomDays(ZOOM_DAY_OPTIONS[index + 1]);
                  }
                }}
              >
                Zoom Out
              </button>
            </div>
          </div>
          {visibleBars.length === 0 ? (
            <p className="text-sm text-slate-500">No projects in the visible date range.</p>
          ) : (
            <div className="space-y-2 overflow-hidden">
              <div className="grid items-center gap-2 md:grid-cols-[260px_1fr]">
                <div className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Project
                </div>
                <div className="relative h-10 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                  {ganttTicks.map((tick) => (
                    <div
                      key={`axis-line-${tick.key}`}
                      className="absolute inset-y-0 border-l border-slate-300/70"
                      style={{ left: `${Math.max(0, Math.min(100, tick.left))}%` }}
                    />
                  ))}
                  {ganttTicks.map((tick) => (
                    <div
                      key={`axis-label-${tick.key}`}
                      className="absolute top-1 -translate-x-1/2 text-[10px] text-slate-600"
                      style={{ left: `${Math.max(0, Math.min(100, tick.left))}%` }}
                    >
                      {tick.label}
                    </div>
                  ))}
                </div>
              </div>
              {visibleBars.map((row) => (
                <div key={row.id} className="grid items-center gap-2 md:grid-cols-[260px_1fr]">
                  <Link href={`/staff/projects/management/${row.id}`} className="block rounded px-2 py-1 hover:bg-slate-50">
                    <p className="text-sm font-medium text-brand-700">{row.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(row.project_start_date)} to {formatDate(row.expected_end_date)}
                    </p>
                  </Link>
                  <div className="relative h-8 w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                    {ganttTicks.map((tick) => (
                      <div
                        key={`row-line-${row.id}-${tick.key}`}
                        className="absolute inset-y-0 border-l border-slate-200"
                        style={{ left: `${Math.max(0, Math.min(100, tick.left))}%` }}
                      />
                    ))}
                    <Link
                      href={`/staff/projects/management/${row.id}`}
                      className="absolute top-1/2 h-4 -translate-y-1/2 rounded bg-brand-200 hover:bg-brand-300"
                      style={{
                        left: `${Math.max(0, Math.min(98, row.left))}%`,
                        width: `${Math.max(2, Math.min(100 - row.left, row.width))}%`
                      }}
                      title={row.description ?? row.name}
                    />
                  </div>
                </div>
              ))}
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
              onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            >
              Previous
            </button>
            <p className="text-sm font-semibold text-slate-900">
              {calendarMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
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
              const entries = projectCalendarMap.get(key) ?? [];
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
                    {entries.slice(0, 2).map((entry) => (
                      <Link
                        key={`${entry.id}-${entry.kind}`}
                        href={`/staff/projects/management/${entry.id}`}
                        className="block truncate rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-700"
                        title={`${entry.kind === "start" ? "Start" : "End"}: ${entry.name}`}
                      >
                        {entry.kind === "start" ? "S" : "E"}: {entry.name}
                      </Link>
                    ))}
                    {entries.length > 2 ? (
                      <p className="text-[11px] text-slate-500">+{entries.length - 2} more</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeTab === "thirty_sixty_ninety" ? (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <TaskColumn
              title="Overdue + Next 30 Days"
              rows={taskBuckets.first}
              emptyMessage="No overdue or next 30-day tasks."
            />
            <TaskColumn title="Days 31-60" rows={taskBuckets.second} emptyMessage="No tasks due in days 31-60." />
            <TaskColumn title="Days 61-90" rows={taskBuckets.third} emptyMessage="No tasks due in days 61-90." />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
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
      {children}
    </button>
  );
}

function TaskColumn({
  title,
  rows,
  emptyMessage
}: {
  title: string;
  rows: PortfolioTaskRow[];
  emptyMessage: string;
}) {
  return (
    <section className="rounded-md border border-slate-200 p-3">
      <h5 className="text-sm font-semibold text-slate-900">{title}</h5>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {rows.map((task) => (
            <Link
              key={task.id}
              href={`/staff/tasks/${task.id}`}
              className="block rounded border border-slate-100 px-2 py-2 hover:bg-slate-50"
            >
              <p className="text-sm font-medium text-brand-700">{task.title}</p>
              <p className="mt-1 text-xs text-slate-500">
                Due: {formatDate(task.due_date)} • Project: {projectNameFromTask(task)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
