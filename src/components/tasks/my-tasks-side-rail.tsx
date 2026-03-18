"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/utils";

export type MyTasksSideRailItem = {
  id: string;
  title: string | null;
  due_date: string | null;
  status: string | null;
  completed_at: string | null;
  parent_task_id: string | null;
  project_id: string | null;
  project_name?: string | null;
};

function isOverdueTask(task: MyTasksSideRailItem) {
  if (task.completed_at || task.status === "completed" || task.status === "cancelled") return false;
  if (!task.due_date) return false;
  return new Date(task.due_date) < new Date();
}

export function MyTasksSideRail({ tasks }: { tasks: MyTasksSideRailItem[] }) {
  const [isOpen, setIsOpen] = useState(false);

  const overdueCount = useMemo(() => tasks.filter(isOverdueTask).length, [tasks]);
  const orderedTasks = useMemo(
    () =>
      [...tasks].sort((left, right) => {
        const leftOverdue = isOverdueTask(left);
        const rightOverdue = isOverdueTask(right);
        if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
        const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.POSITIVE_INFINITY;
        return leftDue - rightDue;
      }),
    [tasks]
  );

  return (
    <>
      <div
        className="fixed bottom-0 right-0 top-32 z-40 flex w-24 min-w-[88px] cursor-pointer flex-col border-l border-slate-200 bg-white/95 px-2 py-4 shadow-sm md:top-24"
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        aria-label="Open My Tasks panel"
      >
        <div className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          My Tasks
        </div>
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Assigned</p>
          <p className="text-lg font-semibold text-slate-900">{tasks.length}</p>
        </div>
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-2 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wide text-red-600">Overdue</p>
          <p className="text-lg font-semibold text-red-700">{overdueCount}</p>
        </div>
        <div className="mt-auto text-center text-[10px] text-slate-500">Tasks + Subtasks</div>
      </div>

      {isOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-32 z-50 md:top-24">
          <button
            type="button"
            aria-label="Close my tasks panel backdrop"
            className="absolute inset-0 bg-black/20"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold text-slate-900">My Tasks</h4>
                <p className="text-xs text-slate-500">
                  {tasks.length} assigned • {overdueCount} overdue
                </p>
              </div>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mb-3 flex justify-end">
              <Link
                href="/staff/tasks"
                className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Open My Tasks Dashboard
              </Link>
            </div>

            {orderedTasks.length === 0 ? (
              <p className="text-sm text-slate-500">No tasks or subtasks are currently assigned to you.</p>
            ) : (
              <div className="space-y-2">
                {orderedTasks.map((task) => {
                  const overdue = isOverdueTask(task);
                  const itemType = task.parent_task_id ? "Subtask" : "Task";
                  return (
                    <Link
                      key={task.id}
                      href={`/staff/tasks/${task.id}`}
                      className={`block rounded-md border px-3 py-2 text-left hover:bg-slate-50 ${
                        overdue ? "border-red-200 bg-red-50/60" : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">{task.title || "-"}</p>
                        {overdue ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {itemType}
                        {task.project_name ? ` • ${task.project_name}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">Due {formatDate(task.due_date)}</p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
