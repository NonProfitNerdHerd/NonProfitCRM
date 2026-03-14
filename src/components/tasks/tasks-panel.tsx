"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type TaskRow = Record<string, unknown> & { id: string };
type FilterOptions = {
  users: Array<{ user_id: string; display_name: string | null }>;
  projects: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; first_name: string; last_name: string }>;
};

export function TasksPanel() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({
    users: [],
    projects: [],
    contacts: []
  });
  const [query, setQuery] = useState({
    assignedTo: "",
    status: "",
    projectId: "",
    contactId: ""
  });
  const [form, setForm] = useState({
    title: "",
    description: "",
    suspenseDate: "",
    priority: "medium",
    assignedToUserId: "",
    contactId: "",
    projectId: "",
    parentTaskId: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTasks() {
    const params = new URLSearchParams();
    if (query.assignedTo) params.set("assignedTo", query.assignedTo);
    if (query.status) params.set("status", query.status);
    if (query.projectId) params.set("projectId", query.projectId);
    if (query.contactId) params.set("contactId", query.contactId);

    const response = await fetch(`/api/tasks?${params.toString()}`);
    const payload = await response.json();
    if (response.ok) {
      setTasks(payload.tasks ?? []);
      setFilters(payload.filters ?? { users: [], projects: [], contacts: [] });
    }
  }

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters() {
    setLoading(true);
    await loadTasks();
    setLoading(false);
  }

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || undefined,
        suspenseDate: form.suspenseDate || undefined,
        priority: form.priority,
        assignedToUserId: form.assignedToUserId || undefined,
        contactId: form.contactId || undefined,
        projectId: form.projectId || undefined,
        parentTaskId: form.parentTaskId || undefined
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to create task.");
      setLoading(false);
      return;
    }

    setForm({
      title: "",
      description: "",
      suspenseDate: "",
      priority: "medium",
      assignedToUserId: "",
      contactId: "",
      projectId: "",
      parentTaskId: ""
    });
    await loadTasks();
    setLoading(false);
  }

  async function setTaskStatus(taskId: string, status: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    await loadTasks();
  }

  const parentOptions = useMemo(
    () => tasks.filter((task) => !task.parent_task_id).slice(0, 80),
    [tasks]
  );

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 p-4">
        <p className="mb-2 text-sm font-semibold">Filter Tasks</p>
        <div className="grid gap-3 md:grid-cols-4">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={query.assignedTo}
            onChange={(event) =>
              setQuery((prev) => ({ ...prev, assignedTo: event.target.value }))
            }
          >
            <option value="">Assigned user</option>
            {filters.users.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name || user.user_id}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={query.status}
            onChange={(event) => setQuery((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="">Status</option>
            <option value="todo">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="blocked">Blocked</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={query.projectId}
            onChange={(event) =>
              setQuery((prev) => ({ ...prev, projectId: event.target.value }))
            }
          >
            <option value="">Project</option>
            {filters.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={query.contactId}
            onChange={(event) =>
              setQuery((prev) => ({ ...prev, contactId: event.target.value }))
            }
          >
            <option value="">Contact</option>
            {filters.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.first_name} {contact.last_name}
              </option>
            ))}
          </select>
        </div>
        <Button className="mt-3" type="button" variant="secondary" onClick={applyFilters}>
          {loading ? "Loading..." : "Apply Filters"}
        </Button>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <p className="mb-2 text-sm font-semibold">Create Task / Subtask</p>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createTask}>
          <Input
            placeholder="Title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
          <Input
            placeholder="Description"
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
          />
          <Input
            type="date"
            value={form.suspenseDate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, suspenseDate: event.target.value }))
            }
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.priority}
            onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.assignedToUserId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, assignedToUserId: event.target.value }))
            }
          >
            <option value="">Assign user</option>
            {filters.users.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name || user.user_id}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.contactId}
            onChange={(event) => setForm((prev) => ({ ...prev, contactId: event.target.value }))}
          >
            <option value="">Related contact</option>
            {filters.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.first_name} {contact.last_name}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.projectId}
            onChange={(event) => setForm((prev) => ({ ...prev, projectId: event.target.value }))}
          >
            <option value="">Related project</option>
            {filters.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.parentTaskId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, parentTaskId: event.target.value }))
            }
          >
            <option value="">Parent task (optional)</option>
            {parentOptions.map((task) => (
              <option key={task.id} value={task.id}>
                {String(task.title)}
              </option>
            ))}
          </select>
          <Button disabled={loading} type="submit">
            {loading ? "Saving..." : "Create Task"}
          </Button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="space-y-2">
        {tasks.map((task) => {
          const contact = Array.isArray(task.contacts) ? task.contacts[0] : task.contacts;
          const project = Array.isArray(task.projects) ? task.projects[0] : task.projects;
          return (
            <article
              key={task.id}
              id={`task-${task.id}`}
              className="rounded-md border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{String(task.title)}</p>
                  <p className="text-xs text-slate-600">{String(task.description ?? "")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    value={String(task.status)}
                    onChange={(event) => setTaskStatus(task.id, event.target.value)}
                  >
                    <option value="todo">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>Due: {formatDate(task.due_date as string)}</span>
                <span>Priority: {String(task.priority)}</span>
                <span>Assigned: {String(task.assigned_to ?? "-")}</span>
                {contact ? (
                  <span>
                    Contact: {String((contact as { first_name: string }).first_name)}{" "}
                    {String((contact as { last_name: string }).last_name)}
                  </span>
                ) : null}
                {project ? <span>Project: {String((project as { name: string }).name)}</span> : null}
                {task.parent_task_id ? <span>Subtask</span> : <span>Parent/Standalone</span>}
                <span>Effective Status: {String(task.effective_status ?? task.status)}</span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
