"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type UserOption = { user_id: string; display_name: string | null };

type SubtaskFormState = {
  title: string;
  description: string;
  status: "todo" | "in_progress" | "completed" | "blocked" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string;
  assignedToUserId: string;
  ownerUserId: string;
  estimatedHours: string;
  actualHours: string;
  percentComplete: string;
};

function emptySubtaskForm(parentTask: Record<string, unknown>): SubtaskFormState {
  return {
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    dueDate: "",
    assignedToUserId: String(parentTask.assigned_to ?? ""),
    ownerUserId: String(parentTask.owner_user_id ?? parentTask.assigned_to ?? ""),
    estimatedHours: "",
    actualHours: "",
    percentComplete: "0"
  };
}

function subtaskFormFromRow(
  row: Record<string, unknown>,
  parentTask: Record<string, unknown>
): SubtaskFormState {
  return {
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    status: (String(row.status ?? "todo") as SubtaskFormState["status"]) || "todo",
    priority: (String(row.priority ?? "medium") as SubtaskFormState["priority"]) || "medium",
    dueDate: String(row.due_date ?? "").slice(0, 10),
    assignedToUserId: String(row.assigned_to ?? ""),
    ownerUserId: String(row.owner_user_id ?? row.assigned_to ?? parentTask.owner_user_id ?? ""),
    estimatedHours: String(row.estimated_hours ?? ""),
    actualHours: String(row.actual_hours ?? ""),
    percentComplete: String(row.percent_complete ?? 0)
  };
}

function parseOptionalNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function TaskEditor({
  task,
  subtasks,
  comments,
  users
}: {
  task: Record<string, unknown>;
  subtasks: Array<Record<string, unknown>>;
  comments: Array<Record<string, unknown>>;
  users: UserOption[];
}) {
  const [form, setForm] = useState({
    title: String(task.title ?? ""),
    description: String(task.description ?? ""),
    status: String(task.status ?? "todo"),
    priority: String(task.priority ?? "medium"),
    suspenseDate: String(task.due_date ?? "").slice(0, 10),
    startDate: String(task.start_date ?? "").slice(0, 10),
    endDate: String(task.end_date ?? "").slice(0, 10),
    assignedToUserId: String(task.assigned_to ?? ""),
    ownerUserId: String(task.owner_user_id ?? task.assigned_to ?? ""),
    estimatedHours: String(task.estimated_hours ?? ""),
    actualHours: String(task.actual_hours ?? ""),
    percentComplete: String(task.percent_complete ?? 0),
    blockingNote: String(task.blocking_note ?? "")
  });
  const [commentBody, setCommentBody] = useState("");
  const [commentRows, setCommentRows] = useState(comments);
  const [saving, setSaving] = useState(false);
  const [subtaskRows, setSubtaskRows] = useState(subtasks);
  const [isSubtaskDrawerOpen, setIsSubtaskDrawerOpen] = useState(false);
  const [subtaskDrawerMode, setSubtaskDrawerMode] = useState<"list" | "form">("list");
  const [activeSubtaskId, setActiveSubtaskId] = useState<string | null>(null);
  const [subtaskForm, setSubtaskForm] = useState<SubtaskFormState>(() => emptySubtaskForm(task));
  const [subtaskSaving, setSubtaskSaving] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const [subtaskMessage, setSubtaskMessage] = useState<string | null>(null);

  async function saveTask() {
    setSaving(true);
    await fetch(`/api/tasks/${task.id as string}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    setSaving(false);
    window.location.reload();
  }

  async function addComment() {
    if (!commentBody.trim()) return;
    setSaving(true);
    const response = await fetch(`/api/tasks/${task.id as string}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commentBody })
    });
    if (response.ok) {
      setCommentRows((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author_user_id: "You",
          comment_body: commentBody,
          created_at: new Date().toISOString()
        }
      ]);
      setCommentBody("");
    }
    setSaving(false);
  }

  function openSubtasksList() {
    setSubtaskDrawerMode("list");
    setIsSubtaskDrawerOpen(true);
    setSubtaskError(null);
  }

  function openNewSubtaskForm() {
    setActiveSubtaskId(null);
    setSubtaskForm(emptySubtaskForm(task));
    setSubtaskDrawerMode("form");
    setIsSubtaskDrawerOpen(true);
    setSubtaskError(null);
  }

  function openExistingSubtaskForm(row: Record<string, unknown>) {
    setActiveSubtaskId(String(row.id ?? ""));
    setSubtaskForm(subtaskFormFromRow(row, task));
    setSubtaskDrawerMode("form");
    setIsSubtaskDrawerOpen(true);
    setSubtaskError(null);
  }

  async function saveSubtask(event: React.FormEvent) {
    event.preventDefault();
    if (!subtaskForm.title.trim()) {
      setSubtaskError("Subtask title is required.");
      return;
    }

    setSubtaskSaving(true);
    setSubtaskError(null);
    setSubtaskMessage(null);

    const payload = {
      title: subtaskForm.title,
      description: subtaskForm.description || undefined,
      status: subtaskForm.status,
      priority: subtaskForm.priority,
      suspenseDate: subtaskForm.dueDate || undefined,
      assignedToUserId: subtaskForm.assignedToUserId || undefined,
      ownerUserId: subtaskForm.ownerUserId || undefined,
      estimatedHours: parseOptionalNumber(subtaskForm.estimatedHours),
      actualHours: parseOptionalNumber(subtaskForm.actualHours),
      percentComplete: parseOptionalNumber(subtaskForm.percentComplete)
    };

    try {
      if (activeSubtaskId) {
        const response = await fetch(`/api/tasks/${activeSubtaskId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(result?.message ?? "Unable to update subtask.");
        }

        setSubtaskRows((prev) =>
          prev.map((row) =>
            String(row.id) === activeSubtaskId
              ? {
                  ...row,
                  title: subtaskForm.title,
                  description: subtaskForm.description || null,
                  status: subtaskForm.status,
                  priority: subtaskForm.priority,
                  due_date: subtaskForm.dueDate || null,
                  assigned_to: subtaskForm.assignedToUserId || null,
                  owner_user_id: subtaskForm.ownerUserId || null,
                  estimated_hours: parseOptionalNumber(subtaskForm.estimatedHours) ?? null,
                  actual_hours: parseOptionalNumber(subtaskForm.actualHours) ?? null,
                  percent_complete: parseOptionalNumber(subtaskForm.percentComplete) ?? 0
                }
              : row
          )
        );
        setSubtaskMessage("Subtask updated.");
      } else {
        const createResponse = await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...payload,
            parentTaskId: String(task.id),
            projectId: String(task.project_id ?? "") || undefined,
            contactId: String(task.contact_id ?? "") || undefined
          })
        });
        const createPayload = await createResponse.json().catch(() => null);
        if (!createResponse.ok) {
          throw new Error(createPayload?.message ?? "Unable to create subtask.");
        }

        const newSubtaskId = String(createPayload?.id ?? "");
        let newSubtask: Record<string, unknown> = {
          id: newSubtaskId || crypto.randomUUID(),
          title: subtaskForm.title,
          description: subtaskForm.description || null,
          status: subtaskForm.status,
          priority: subtaskForm.priority,
          due_date: subtaskForm.dueDate || null,
          assigned_to: subtaskForm.assignedToUserId || null,
          owner_user_id: subtaskForm.ownerUserId || null,
          estimated_hours: parseOptionalNumber(subtaskForm.estimatedHours) ?? null,
          actual_hours: parseOptionalNumber(subtaskForm.actualHours) ?? null,
          percent_complete: parseOptionalNumber(subtaskForm.percentComplete) ?? 0
        };

        if (newSubtaskId) {
          const taskResponse = await fetch(`/api/tasks/${newSubtaskId}`);
          const taskPayload = await taskResponse.json().catch(() => null);
          if (taskResponse.ok && taskPayload?.task) {
            newSubtask = taskPayload.task as Record<string, unknown>;
          }
        }

        setSubtaskRows((prev) => [newSubtask, ...prev]);
        setSubtaskMessage("Subtask created.");
      }

      setSubtaskDrawerMode("list");
      setActiveSubtaskId(null);
      setSubtaskForm(emptySubtaskForm(task));
    } catch (error) {
      setSubtaskError(error instanceof Error ? error.message : "Unable to save subtask.");
    } finally {
      setSubtaskSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="fixed right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2">
        <Button type="button" onClick={openSubtasksList}>
          See Sub Tasks
        </Button>
        <Button type="button" variant="secondary" onClick={openNewSubtaskForm}>
          Add Subtask
        </Button>
      </div>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="text-sm font-semibold">Task Details</h4>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <Input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Title"
          />
          <Input
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
            placeholder="Description"
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="todo">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="blocked">Blocked</option>
            <option value="cancelled">Cancelled</option>
          </select>
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
          <Input
            type="date"
            value={form.suspenseDate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, suspenseDate: event.target.value }))
            }
          />
          <Input
            type="date"
            value={form.startDate}
            onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
          />
          <Input
            type="date"
            value={form.endDate}
            onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.assignedToUserId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, assignedToUserId: event.target.value }))
            }
          >
            <option value="">Unassigned</option>
            {users.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name ?? user.user_id}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.ownerUserId}
            onChange={(event) => setForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}
          >
            <option value="">Task owner</option>
            {users.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name ?? user.user_id}
              </option>
            ))}
          </select>
          <Input
            value={form.estimatedHours}
            onChange={(event) => setForm((prev) => ({ ...prev, estimatedHours: event.target.value }))}
            placeholder="Estimated hours"
          />
          <Input
            value={form.actualHours}
            onChange={(event) => setForm((prev) => ({ ...prev, actualHours: event.target.value }))}
            placeholder="Actual hours"
          />
          <Input
            value={form.percentComplete}
            onChange={(event) => setForm((prev) => ({ ...prev, percentComplete: event.target.value }))}
            placeholder="Percent complete"
          />
          <Input
            value={form.blockingNote}
            onChange={(event) => setForm((prev) => ({ ...prev, blockingNote: event.target.value }))}
            placeholder="Blocking notes / dependency notes"
          />
        </div>
        <Button className="mt-3" type="button" onClick={saveTask} disabled={saving}>
          {saving ? "Saving..." : "Save Task"}
        </Button>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="text-sm font-semibold">Comments (@mention supported)</h4>
        <p className="mt-1 text-xs text-slate-500">
          Mention teammates by display name token, e.g. @IJRebout.
        </p>
        <div className="mt-2 space-y-2">
          {commentRows.map((comment) => (
            <div key={String(comment.id)} className="rounded-md border border-slate-200 p-2">
              <p className="text-xs text-slate-500">
                {String(comment.author_user_id ?? "Unknown")} • {formatDate(comment.created_at as string)}
              </p>
              <p className="text-sm text-slate-800">{String(comment.comment_body ?? "")}</p>
            </div>
          ))}
          {commentRows.length === 0 ? <p className="text-sm text-slate-500">No comments yet.</p> : null}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            placeholder="Add comment with @mentions"
          />
          <Button type="button" onClick={addComment} disabled={saving}>
            Add Comment
          </Button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="text-sm font-semibold">Subtasks</h4>
        <p className="mt-1 text-xs text-slate-500">
          Use the right-side fly-in to view, add, and edit subtask items.
        </p>
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="secondary" onClick={openSubtasksList}>
            See Sub Tasks
          </Button>
          <Button type="button" onClick={openNewSubtaskForm}>
            Add Subtask
          </Button>
        </div>
      </section>

      {isSubtaskDrawerOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close subtask drawer backdrop"
            className="absolute inset-0 bg-black/20"
            onClick={() => setIsSubtaskDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold text-slate-900">
                {subtaskDrawerMode === "list"
                  ? "Sub Tasks"
                  : activeSubtaskId
                    ? "Edit Subtask"
                    : "Add Subtask"}
              </h4>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setIsSubtaskDrawerOpen(false)}
              >
                Close
              </button>
            </div>

            {subtaskMessage ? <p className="mb-2 text-sm text-green-700">{subtaskMessage}</p> : null}
            {subtaskError ? <p className="mb-2 text-sm text-red-700">{subtaskError}</p> : null}

            {subtaskDrawerMode === "list" ? (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Button type="button" onClick={openNewSubtaskForm}>
                    Add Subtask
                  </Button>
                </div>
                {subtaskRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No subtasks yet.</p>
                ) : (
                  subtaskRows.map((subtask) => (
                    <button
                      type="button"
                      key={String(subtask.id)}
                      className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => openExistingSubtaskForm(subtask)}
                    >
                      <p className="text-sm font-medium text-slate-900">{String(subtask.title ?? "-")}</p>
                      <p className="text-xs text-slate-500">
                        {String(subtask.status ?? "-")} • {String(subtask.priority ?? "-")} • Due{" "}
                        {formatDate(subtask.due_date as string)}
                      </p>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <form className="space-y-3" onSubmit={saveSubtask}>
                <Input
                  value={subtaskForm.title}
                  onChange={(event) =>
                    setSubtaskForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Subtask title"
                  required
                />
                <Input
                  value={subtaskForm.description}
                  onChange={(event) =>
                    setSubtaskForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Description"
                />
                <div className="grid gap-2 md:grid-cols-2">
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={subtaskForm.status}
                    onChange={(event) =>
                      setSubtaskForm((prev) => ({
                        ...prev,
                        status: event.target.value as SubtaskFormState["status"]
                      }))
                    }
                  >
                    <option value="todo">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={subtaskForm.priority}
                    onChange={(event) =>
                      setSubtaskForm((prev) => ({
                        ...prev,
                        priority: event.target.value as SubtaskFormState["priority"]
                      }))
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <Input
                    type="date"
                    value={subtaskForm.dueDate}
                    onChange={(event) =>
                      setSubtaskForm((prev) => ({ ...prev, dueDate: event.target.value }))
                    }
                  />
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={subtaskForm.ownerUserId}
                    onChange={(event) =>
                      setSubtaskForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
                    }
                  >
                    <option value="">Subtask owner</option>
                    {users.map((user) => (
                      <option key={user.user_id} value={user.user_id}>
                        {user.display_name ?? user.user_id}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={subtaskForm.assignedToUserId}
                    onChange={(event) =>
                      setSubtaskForm((prev) => ({
                        ...prev,
                        assignedToUserId: event.target.value
                      }))
                    }
                  >
                    <option value="">Assigned to</option>
                    {users.map((user) => (
                      <option key={user.user_id} value={user.user_id}>
                        {user.display_name ?? user.user_id}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={subtaskForm.estimatedHours}
                    onChange={(event) =>
                      setSubtaskForm((prev) => ({
                        ...prev,
                        estimatedHours: event.target.value
                      }))
                    }
                    placeholder="Estimated hours"
                  />
                  <Input
                    value={subtaskForm.actualHours}
                    onChange={(event) =>
                      setSubtaskForm((prev) => ({
                        ...prev,
                        actualHours: event.target.value
                      }))
                    }
                    placeholder="Actual hours"
                  />
                  <Input
                    value={subtaskForm.percentComplete}
                    onChange={(event) =>
                      setSubtaskForm((prev) => ({
                        ...prev,
                        percentComplete: event.target.value
                      }))
                    }
                    placeholder="Percent complete"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={subtaskSaving}>
                    {subtaskSaving ? "Saving..." : "Save Subtask"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setSubtaskDrawerMode("list");
                      setSubtaskError(null);
                    }}
                  >
                    Back to List
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
