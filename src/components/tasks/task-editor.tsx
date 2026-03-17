"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type UserOption = { user_id: string; display_name: string | null };

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

  return (
    <div className="space-y-4">
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
        <div className="mt-2 space-y-1">
          {subtasks.length === 0 ? (
            <p className="text-sm text-slate-500">No subtasks yet.</p>
          ) : (
            subtasks.map((subtask) => (
              <Link
                key={String(subtask.id)}
                href={`/staff/tasks/${String(subtask.id)}`}
                className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
              >
                <p className="text-sm font-medium text-slate-900">{String(subtask.title ?? "-")}</p>
                <p className="text-xs text-slate-500">
                  {String(subtask.status ?? "-")} • {String(subtask.priority ?? "-")} • Due{" "}
                  {formatDate(subtask.due_date as string)}
                </p>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
