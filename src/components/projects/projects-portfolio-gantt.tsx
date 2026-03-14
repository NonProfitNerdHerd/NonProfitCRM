"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";

export type ProjectPortfolioRow = {
  id: string;
  name: string;
  status: string;
  project_start_date: string | null;
  expected_end_date: string | null;
  description: string | null;
};

function toDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ProjectsPortfolioGantt({ projects }: { projects: ProjectPortfolioRow[] }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartScroll, setDragStartScroll] = useState(0);

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === "active"),
    [projects]
  );

  const timeline = useMemo(() => {
    const rows = activeProjects.map((project) => {
      const start = toDate(project.project_start_date);
      const end = toDate(project.expected_end_date);
      return {
        ...project,
        start,
        end: end && start && end < start ? start : end ?? start
      };
    });

    const starts = rows.map((row) => row.start).filter((row): row is Date => Boolean(row));
    const ends = rows.map((row) => row.end).filter((row): row is Date => Boolean(row));
    const startDate = starts.length ? new Date(Math.min(...starts.map((row) => row.getTime()))) : new Date();
    const endDate = ends.length ? new Date(Math.max(...ends.map((row) => row.getTime()))) : new Date();

    startDate.setUTCDate(1);
    endDate.setUTCDate(1);
    endDate.setUTCMonth(endDate.getUTCMonth() + 1);

    const months: Date[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      months.push(new Date(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    const monthWidth = 120;
    const fullWidth = Math.max(900, months.length * monthWidth);
    const fullSpanMs = Math.max(1, endDate.getTime() - startDate.getTime());

    const bars = rows.map((row) => {
      if (!row.start || !row.end) {
        return { ...row, left: 0, width: 0, hasTimeline: false };
      }
      const left = ((row.start.getTime() - startDate.getTime()) / fullSpanMs) * fullWidth;
      const width = Math.max(
        6,
        ((row.end.getTime() - row.start.getTime()) / fullSpanMs) * fullWidth
      );
      return { ...row, left, width, hasTimeline: true };
    });

    return { months, fullWidth, bars };
  }, [activeProjects]);

  function onMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (!scrollRef.current) return;
    setDragging(true);
    setDragStartX(event.clientX);
    setDragStartScroll(scrollRef.current.scrollLeft);
  }

  function onMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!dragging || !scrollRef.current) return;
    const delta = event.clientX - dragStartX;
    scrollRef.current.scrollLeft = dragStartScroll - delta;
  }

  function onMouseUp() {
    setDragging(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Active projects shown on a timeline based on Project Start Date and Projected End Date.
      </p>

      <div
        ref={scrollRef}
        className={`overflow-x-auto rounded-md border border-slate-200 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div style={{ minWidth: `${timeline.fullWidth + 280}px` }} className="min-h-[420px]">
          <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-white">
            <div className="w-[280px] border-r border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Project
            </div>
            <div className="relative" style={{ width: `${timeline.fullWidth}px` }}>
              <div className="flex">
                {timeline.months.map((month) => (
                  <div
                    key={month.toISOString()}
                    className="border-r border-slate-200 px-2 py-2 text-xs text-slate-600"
                    style={{ width: "120px" }}
                  >
                    {month.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {timeline.bars.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">No active projects to display.</div>
            ) : (
              timeline.bars.map((row) => (
                <div key={row.id} className="flex border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => router.push(`/staff/projects/management/${row.id}`)}
                    className="w-[280px] border-r border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <p className="text-sm font-medium text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(row.project_start_date)} → {formatDate(row.expected_end_date)}
                    </p>
                  </button>
                  <div className="relative py-2" style={{ width: `${timeline.fullWidth}px` }}>
                    {row.hasTimeline ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/staff/projects/management/${row.id}`)}
                        className="absolute h-7 rounded bg-brand-200 px-2 text-left text-xs font-medium text-brand-900 hover:bg-brand-300"
                        style={{
                          left: `${row.left}px`,
                          width: `${row.width}px`
                        }}
                        title={row.description ?? row.name}
                      >
                        <span className="line-clamp-1">{row.name}</span>
                      </button>
                    ) : (
                      <p className="px-2 text-xs text-slate-400">Missing project dates</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
