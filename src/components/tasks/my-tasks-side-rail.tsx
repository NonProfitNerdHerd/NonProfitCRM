"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function MyTasksSideRail({
  tasks,
  defaultProjectId
}: {
  tasks: MyTasksSideRailItem[];
  defaultProjectId?: string | null;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [taskRows, setTaskRows] = useState(tasks);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent"
  });

  useEffect(() => {
    setTaskRows(tasks);
  }, [tasks]);
  const isTaskDetailPage = pathname.includes("/staff/tasks/");
  const tenantPrefix = useMemo(() => {
    const staffIndex = pathname.indexOf("/staff");
    return staffIndex > 0 ? pathname.slice(0, staffIndex) : "";
  }, [pathname]);
  const withTenantPrefix = (href: string) => `${tenantPrefix}${href}`;

  const overdueCount = useMemo(() => taskRows.filter(isOverdueTask).length, [taskRows]);
  const orderedTasks = useMemo(
    () =>
      [...taskRows].sort((left, right) => {
        const leftOverdue = isOverdueTask(left);
        const rightOverdue = isOverdueTask(right);
        if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
        const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.POSITIVE_INFINITY;
        return leftDue - rightDue;
      }),
    [taskRows]
  );

  async function createTaskFromRail(event: React.FormEvent) {
    event.preventDefault();
    if (!createForm.title.trim()) {
      setCreateError("Task title is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim() || undefined,
          suspenseDate: createForm.dueDate || undefined,
          priority: createForm.priority,
          projectId: defaultProjectId || undefined
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to create task.");
      }
      const createdId = String(payload?.id ?? "");
      if (!createdId) throw new Error("Task was created but no id was returned.");
      setTaskRows((prev) => [
        {
          id: createdId,
          title: createForm.title.trim(),
          due_date: createForm.dueDate || null,
          status: "todo",
          completed_at: null,
          parent_task_id: null,
          project_id: defaultProjectId ?? null,
          project_name: "consituent-outreach"
        },
        ...prev
      ]);
      setCreateForm({ title: "", description: "", dueDate: "", priority: "medium" });
      setShowCreateTask(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create task.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div
        className={`fixed bottom-0 top-32 z-40 flex w-24 min-w-[88px] cursor-pointer flex-col border-l border-slate-200 bg-white/95 px-2 py-4 shadow-sm print:hidden md:top-24 ${
          isTaskDetailPage ? "right-24 md:right-28" : "right-0"
        }`}
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
          <p className="text-lg font-semibold text-slate-900">{taskRows.length}</p>
        </div>
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-2 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wide text-red-600">Overdue</p>
          <p className="text-lg font-semibold text-red-700">{overdueCount}</p>
        </div>
        <div className="mt-auto text-center text-[10px] text-slate-500">Tasks + Subtasks</div>
      </div>

      {isOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-32 z-50 print:hidden md:top-24">
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
                  {taskRows.length} assigned • {overdueCount} overdue
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowCreateTask((prev) => !prev);
                    setCreateError(null);
                  }}
                >
                  {showCreateTask ? "Show Tasks" : "Create Task"}
                </Button>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                  onClick={() => setIsOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mb-3 flex justify-end">
              <Link
                href={withTenantPrefix("/staff/tasks")}
                className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Open My Tasks Dashboard
              </Link>
            </div>

            {showCreateTask ? (
              <form className="space-y-3 rounded-md border border-slate-200 p-3" onSubmit={createTaskFromRail}>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Task Title</label>
                  <Input
                    value={createForm.title}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Enter task title"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={createForm.description}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="Optional details"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Due Date</label>
                    <Input
                      type="date"
                      value={createForm.dueDate}
                      onChange={(event) =>
                        setCreateForm((prev) => ({ ...prev, dueDate: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Priority</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={createForm.priority}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          priority: event.target.value as "low" | "medium" | "high" | "urgent"
                        }))
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                {createError ? <p className="text-sm text-red-700">{createError}</p> : null}
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create Task"}
                </Button>
              </form>
            ) : orderedTasks.length === 0 ? (
              <p className="text-sm text-slate-500">No tasks or subtasks are currently assigned to you.</p>
            ) : (
              <div className="space-y-2">
                {orderedTasks.map((task) => {
                  const overdue = isOverdueTask(task);
                  const itemType = task.parent_task_id ? "Subtask" : "Task";
                  return (
                    <Link
                      key={task.id}
                      href={withTenantPrefix(`/staff/tasks/${task.id}`)}
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
