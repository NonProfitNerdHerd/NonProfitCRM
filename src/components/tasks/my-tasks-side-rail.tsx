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
  priority?: string | null;
  completed_at: string | null;
  parent_task_id: string | null;
  project_id: string | null;
  project_name?: string | null;
};

type TaskType = "Call" | "Email" | "Mail" | "Other";
type TaskAssociationCategory = "Donor" | "Contact" | "Donor Organization" | "Organization";

function isOverdueTask(task: MyTasksSideRailItem) {
  if (task.completed_at || task.status === "completed" || task.status === "cancelled") return false;
  if (!task.due_date) return false;
  return new Date(task.due_date) < new Date();
}

export function MyTasksSideRail({
  tasks,
  defaultProjectId,
  projects,
  currentUserId,
  assignableUsers,
  givingFuelModuleVisible = false,
  givingFuelPendingCount = 0,
  givingFuelFailedCount = 0
}: {
  tasks: MyTasksSideRailItem[];
  defaultProjectId?: string | null;
  projects: Array<{ id: string; name: string }>;
  currentUserId: string;
  assignableUsers: Array<{ id: string; name: string }>;
  givingFuelModuleVisible?: boolean;
  givingFuelPendingCount?: number;
  givingFuelFailedCount?: number;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [taskRows, setTaskRows] = useState(tasks);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [snoozeTarget, setSnoozeTarget] = useState<MyTasksSideRailItem | null>(null);
  const [customSnoozeUntil, setCustomSnoozeUntil] = useState("");
  const [snoozedUntilByTaskId, setSnoozedUntilByTaskId] = useState<Record<string, string>>({});
  const [contactLookupQuery, setContactLookupQuery] = useState("");
  const [contactLookupOpen, setContactLookupOpen] = useState(false);
  const [contactLookupLoading, setContactLookupLoading] = useState(false);
  const [contactLookupResults, setContactLookupResults] = useState<
    Array<{ id: string; label: string; category: TaskAssociationCategory }>
  >([]);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    taskType: "Other" as TaskType,
    projectId: defaultProjectId ?? "",
    assignedToUserId: currentUserId,
    contactId: "",
    dueDate: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent"
  });

  useEffect(() => {
    setTaskRows(tasks);
  }, [tasks]);
  useEffect(() => {
    setCreateForm((prev) => {
      if (prev.projectId) return prev;
      if (defaultProjectId) return { ...prev, projectId: defaultProjectId };
      if (projects.length > 0) return { ...prev, projectId: projects[0].id };
      return prev;
    });
  }, [defaultProjectId, projects]);
  useEffect(() => {
    setCreateForm((prev) => {
      if (prev.assignedToUserId) return prev;
      return { ...prev, assignedToUserId: currentUserId };
    });
  }, [currentUserId]);
  const tenantPrefix = useMemo(() => {
    const staffIndex = pathname.indexOf("/staff");
    return staffIndex > 0 ? pathname.slice(0, staffIndex) : "";
  }, [pathname]);
  const snoozeStorageKey = useMemo(
    () => `my-tasks-rail-snoozes:${tenantPrefix || "default"}`,
    [tenantPrefix]
  );
  const withTenantPrefix = (href: string) => `${tenantPrefix}${href}`;
  const assigneeOptions = useMemo(() => {
    const options: Array<{ id: string; name: string }> = [];
    const seen = new Set<string>();
    for (const user of assignableUsers) {
      if (!user.id || seen.has(user.id)) continue;
      options.push({ id: user.id, name: user.name });
      seen.add(user.id);
    }
    if (!seen.has(currentUserId)) {
      options.unshift({ id: currentUserId, name: "Me" });
    }
    return options.sort((left, right) => left.name.localeCompare(right.name));
  }, [assignableUsers, currentUserId]);

  useEffect(() => {
    if (!contactLookupOpen) return;
    const query = contactLookupQuery.trim();
    if (query.length < 2) {
      setContactLookupResults([]);
      setContactLookupLoading(false);
      return;
    }
    let ignore = false;
    const timerId = window.setTimeout(async () => {
      setContactLookupLoading(true);
      try {
        const response = await fetch(
          `/api/tasks/association-contacts?q=${encodeURIComponent(contactLookupQuery.trim())}`
        );
        const payload = await response.json().catch(() => null);
        if (ignore) return;
        if (!response.ok) {
          setContactLookupResults([]);
          return;
        }
        const rows = Array.isArray(payload?.results) ? payload.results : [];
        const mappedRows = rows.map((row: unknown) => ({
          id: String((row as { id?: unknown }).id ?? ""),
          label: String((row as { label?: unknown }).label ?? ""),
          category: String((row as { category?: unknown }).category ?? "Contact") as TaskAssociationCategory
        }));
        setContactLookupResults(
          mappedRows.filter((row: { id: string; label: string }) => row.id.length > 0 && row.label.length > 0)
        );
      } catch {
        if (!ignore) setContactLookupResults([]);
      } finally {
        if (!ignore) setContactLookupLoading(false);
      }
    }, 250);
    return () => {
      ignore = true;
      window.clearTimeout(timerId);
    };
  }, [contactLookupOpen, contactLookupQuery]);

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(snoozeStorageKey);
      if (!raw) {
        setSnoozedUntilByTaskId({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      const validEntries = Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => new Date(value).getTime() > Date.now())
      );
      setSnoozedUntilByTaskId(validEntries);
    } catch {
      setSnoozedUntilByTaskId({});
    }
  }, [snoozeStorageKey]);

  useEffect(() => {
    const validEntries = Object.fromEntries(
      Object.entries(snoozedUntilByTaskId).filter(([, value]) => new Date(value).getTime() > nowMs)
    );
    if (Object.keys(validEntries).length !== Object.keys(snoozedUntilByTaskId).length) {
      setSnoozedUntilByTaskId(validEntries);
      return;
    }
    window.localStorage.setItem(snoozeStorageKey, JSON.stringify(validEntries));
  }, [nowMs, snoozedUntilByTaskId, snoozeStorageKey]);

  const visibleTasks = useMemo(
    () =>
      taskRows.filter((task) => {
        const snoozedUntil = snoozedUntilByTaskId[task.id];
        if (!snoozedUntil) return true;
        return new Date(snoozedUntil).getTime() <= nowMs;
      }),
    [nowMs, snoozedUntilByTaskId, taskRows]
  );

  const overdueCount = useMemo(() => visibleTasks.filter(isOverdueTask).length, [visibleTasks]);
  const orderedTasks = useMemo(
    () =>
      [...visibleTasks].sort((left, right) => {
        const leftOverdue = isOverdueTask(left);
        const rightOverdue = isOverdueTask(right);
        if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
        const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.POSITIVE_INFINITY;
        return leftDue - rightDue;
      }),
    [visibleTasks]
  );

  async function createTaskFromRail(event: React.FormEvent) {
    event.preventDefault();
    if (!createForm.title.trim()) {
      setCreateError("Task title is required.");
      return;
    }
    if (!createForm.description.trim()) {
      setCreateError("Task description is required.");
      return;
    }
    if (!createForm.projectId) {
      setCreateError("Project selection is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const typedDescription = createForm.description.trim();
      const descriptionWithType = [`Follow-Up Type: ${createForm.taskType}`, typedDescription]
        .filter(Boolean)
        .join("\n");
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: descriptionWithType || undefined,
          suspenseDate: createForm.dueDate || undefined,
          priority: createForm.priority,
          projectId: createForm.projectId,
          assignedToUserId: createForm.assignedToUserId || undefined,
          contactId: createForm.contactId || undefined
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to create task.");
      }
      const createdId = String(payload?.id ?? "");
      if (!createdId) throw new Error("Task was created but no id was returned.");
      const selectedProject = projects.find((entry) => entry.id === createForm.projectId);
      if (createForm.assignedToUserId === currentUserId) {
        setTaskRows((prev) => [
          {
            id: createdId,
            title: createForm.title.trim(),
            due_date: createForm.dueDate || null,
            status: "todo",
            priority: createForm.priority,
            completed_at: null,
            parent_task_id: null,
            project_id: createForm.projectId,
            project_name: selectedProject?.name ?? null
          },
          ...prev
        ]);
      }
      setCreateForm((prev) => ({
        ...prev,
        title: "",
        description: "",
        taskType: "Other",
        assignedToUserId: currentUserId,
        contactId: "",
        dueDate: "",
        priority: "medium"
      }));
      setContactLookupQuery("");
      setContactLookupOpen(false);
      setContactLookupResults([]);
      setShowCreateTask(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create task.");
    } finally {
      setCreating(false);
    }
  }

  function applySnooze(until: Date) {
    if (!snoozeTarget) return;
    setSnoozedUntilByTaskId((prev) => ({
      ...prev,
      [snoozeTarget.id]: until.toISOString()
    }));
    setSnoozeTarget(null);
    setCustomSnoozeUntil("");
  }

  function snoozeByHours(hours: number) {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000);
    applySnooze(until);
  }

  function snoozeUntilNextMonday() {
    const now = new Date();
    const day = now.getDay();
    const daysUntilMonday = ((8 - day) % 7) || 7;
    const until = new Date(now);
    until.setDate(now.getDate() + daysUntilMonday);
    until.setHours(9, 0, 0, 0);
    applySnooze(until);
  }

  function submitCustomSnooze(event: React.FormEvent) {
    event.preventDefault();
    if (!customSnoozeUntil) return;
    const until = new Date(customSnoozeUntil);
    if (Number.isNaN(until.getTime())) return;
    applySnooze(until);
  }

  const isTaskDetailPage = /\/staff\/tasks\/[0-9a-f]{8}-[0-9a-f-]{27,36}(?:$|[/?#])/i.test(pathname);
  if (isTaskDetailPage) return null;

  return (
    <>
      <div
        className="fixed bottom-0 right-0 top-0 z-40 flex w-24 min-w-[88px] cursor-pointer flex-col border-l border-slate-200 bg-white/95 px-2 py-4 shadow-sm print:hidden"
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
          <p className="text-lg font-semibold text-slate-900">{visibleTasks.length}</p>
        </div>
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-2 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wide text-red-600">Overdue</p>
          <p className="text-lg font-semibold text-red-700">{overdueCount}</p>
        </div>
        {givingFuelModuleVisible ? (
          <Link
            href={withTenantPrefix("/staff/data-tools/giving-fuel")}
            className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-2 text-center text-indigo-700 hover:bg-indigo-100"
            onClick={(event) => event.stopPropagation()}
            aria-label="Open Giving Fuel review queue"
          >
            <p className="text-[10px] uppercase tracking-wide">GF Review</p>
            <p className="text-base font-semibold">
              {Number(givingFuelPendingCount) + Number(givingFuelFailedCount)}
            </p>
          </Link>
        ) : null}
        <Link
          href={withTenantPrefix("/staff/tasks/call-sheet")}
          className="mt-3 inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-2 py-2 text-slate-700 hover:bg-slate-50"
          onClick={(event) => event.stopPropagation()}
          aria-label="Open call sheet builder"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.9 19.9 0 0 1-8.7-3.1 19.5 19.5 0 0 1-6-6A19.9 19.9 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.9 9.6a16 16 0 0 0 6.5 6.5l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z" />
          </svg>
        </Link>
        <div className="mt-auto text-center text-[10px] text-slate-500">Tasks + Subtasks</div>
      </div>

      {isOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 print:hidden">
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
                  {visibleTasks.length} assigned • {overdueCount} overdue
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
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

            <div className="mb-3 flex flex-wrap justify-end gap-2">
              <Link
                href={withTenantPrefix("/staff/tasks")}
                className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Open My Tasks Dashboard
              </Link>
            </div>

            {givingFuelModuleVisible ? (
              <div className="mb-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      Giving Fuel Reviews
                    </p>
                    <p className="text-xs text-indigo-900">
                      Pending: {Number(givingFuelPendingCount)} • Failed: {Number(givingFuelFailedCount)}
                    </p>
                  </div>
                  <Link
                    href={withTenantPrefix("/staff/data-tools/giving-fuel")}
                    className="rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                    onClick={() => setIsOpen(false)}
                  >
                    Open Queue
                  </Link>
                </div>
              </div>
            ) : null}

            {showCreateTask ? (
              <form className="space-y-3 rounded-md border border-slate-200 p-3" onSubmit={createTaskFromRail}>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Task Title <span className="text-red-600">*</span>
                  </label>
                  <Input
                    value={createForm.title}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Enter task title"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Description <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={createForm.description}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="Enter task description"
                    required
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Task Type</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={createForm.taskType}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          taskType: event.target.value as TaskType
                        }))
                      }
                    >
                      <option value="Call">Phone Call</option>
                      <option value="Email">Email</option>
                      <option value="Mail">Mail</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Assign To</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={createForm.assignedToUserId}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          assignedToUserId: event.target.value
                        }))
                      }
                    >
                      {assigneeOptions.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.id === currentUserId ? `${user.name} (Me)` : user.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="relative">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Constituent Contact</label>
                  <Input
                    value={contactLookupQuery}
                    onFocus={() => setContactLookupOpen(true)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setContactLookupQuery(value);
                      setContactLookupOpen(true);
                      if (createForm.contactId) {
                        setCreateForm((prev) => ({ ...prev, contactId: "" }));
                      }
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setContactLookupOpen(false), 120);
                    }}
                    placeholder="Type to search and select a constituent"
                    aria-label="Constituent Contact"
                  />
                  {contactLookupOpen ? (
                    <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                      <button
                        type="button"
                        className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                          !createForm.contactId ? "bg-slate-50 font-medium text-slate-900" : "text-slate-700"
                        }`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setCreateForm((prev) => ({ ...prev, contactId: "" }));
                          setContactLookupQuery("");
                          setContactLookupOpen(false);
                        }}
                      >
                        No related record
                      </button>
                      {contactLookupQuery.trim().length < 2 ? (
                        <p className="px-3 py-2 text-sm text-slate-500">
                          Type at least 2 characters to search.
                        </p>
                      ) : contactLookupLoading ? (
                        <p className="px-3 py-2 text-sm text-slate-500">Searching...</p>
                      ) : contactLookupResults.length > 0 ? (
                        contactLookupResults.map((contact) => (
                          <button
                            type="button"
                            key={contact.id}
                            className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                              createForm.contactId === contact.id
                                ? "bg-blue-50 font-medium text-blue-700"
                                : "text-slate-700"
                            }`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setCreateForm((prev) => ({ ...prev, contactId: contact.id }));
                              setContactLookupQuery(`${contact.label} (${contact.category})`);
                              setContactLookupOpen(false);
                            }}
                          >
                            {contact.label} <span className="text-xs text-slate-500">({contact.category})</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-sm text-slate-500">No matching constituents found.</p>
                      )}
                    </div>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Project <span className="text-red-600">*</span>
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={createForm.projectId}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, projectId: event.target.value }))
                    }
                    required
                  >
                    <option value="">Select project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
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
                      onClick={() => setIsOpen(false)}
                      className={`relative block rounded-md border px-3 py-2 pb-6 pr-9 text-left hover:bg-slate-50 ${
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
                      <p className="text-[11px] text-slate-500">
                        Priority: {String(task.priority ?? "medium").replaceAll("_", " ")}
                      </p>
                      <button
                        type="button"
                        aria-label={`Snooze task ${task.title ?? task.id}`}
                        className="absolute bottom-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSnoozeTarget(task);
                          setCustomSnoozeUntil("");
                        }}
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="13" r="7" />
                          <path d="M12 9v4l3 2" />
                          <path d="M5 3L3 5" />
                          <path d="M19 3l2 2" />
                        </svg>
                      </button>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
      {snoozeTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4">
          <button
            type="button"
            aria-label="Close snooze dialog backdrop"
            className="absolute inset-0"
            onClick={() => {
              setSnoozeTarget(null);
              setCustomSnoozeUntil("");
            }}
          />
          <div className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
            <h5 className="text-sm font-semibold text-slate-900">Snooze task</h5>
            <p className="mt-1 text-xs text-slate-600">{snoozeTarget.title || "Task"}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => snoozeByHours(1)}>
                1 hour
              </Button>
              <Button type="button" variant="secondary" onClick={() => snoozeByHours(3)}>
                3 hours
              </Button>
              <Button type="button" variant="secondary" onClick={() => snoozeByHours(8)}>
                8 hours
              </Button>
              <Button type="button" variant="secondary" onClick={() => snoozeByHours(24)}>
                1 day
              </Button>
              <Button type="button" variant="secondary" className="col-span-2" onClick={snoozeUntilNextMonday}>
                Next Monday
              </Button>
            </div>
            <form className="mt-3 border-t border-slate-200 pt-3" onSubmit={submitCustomSnooze}>
              <label className="mb-1 block text-xs font-medium text-slate-600">Pick a date and time</label>
              <Input
                type="datetime-local"
                value={customSnoozeUntil}
                onChange={(event) => setCustomSnoozeUntil(event.target.value)}
              />
              <div className="mt-3 flex items-center gap-2">
                <Button type="submit" disabled={!customSnoozeUntil}>
                  Snooze
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSnoozeTarget(null);
                    setCustomSnoozeUntil("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
