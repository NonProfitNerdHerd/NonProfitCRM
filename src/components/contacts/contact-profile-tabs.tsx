"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";

type ContactProfileTabsProps = {
  contactId: string;
  taskUrgency: "default" | "yellow" | "red";
  activity: Array<Record<string, unknown>>;
  donations: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  staffUsers: Array<{ user_id: string }>;
};

export function ContactProfileTabs({
  contactId,
  taskUrgency,
  activity,
  donations,
  notes,
  tasks,
  staffUsers
}: ContactProfileTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"activity" | "donations" | "notes" | "tasks">(
    "activity"
  );
  const [donationForm, setDonationForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    paymentType: "Cash",
    checkNumber: "",
    transactionId: "",
    memo: ""
  });
  const [noteBody, setNoteBody] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpAssignedToUserId, setFollowUpAssignedToUserId] = useState("");
  const [followUpSuspenseDate, setFollowUpSuspenseDate] = useState("");
  const [followUpTaskDescription, setFollowUpTaskDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const taskTabClasses = useMemo(() => {
    if (taskUrgency === "red") return "bg-red-100 text-red-800 border-red-200";
    if (taskUrgency === "yellow") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
  }, [taskUrgency]);

  async function submitDonation(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/donations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactId,
        date: donationForm.date,
        amount: Number(donationForm.amount),
        paymentType: donationForm.paymentType,
        checkNumber: donationForm.checkNumber || undefined,
        transactionId: donationForm.transactionId || undefined,
        memo: donationForm.memo || undefined
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to save donation.");
      setLoading(false);
      return;
    }

    setMessage("Donation added.");
    setDonationForm({
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      paymentType: "Cash",
      checkNumber: "",
      transactionId: "",
      memo: ""
    });
    setLoading(false);
    router.refresh();
  }

  async function submitNote(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contactId,
        body: noteBody,
        followUpRequired,
        followUpAssignedToUserId: followUpAssignedToUserId || undefined,
        followUpSuspenseDate: followUpSuspenseDate || undefined,
        followUpTaskDescription: followUpTaskDescription || undefined
      })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to save note.");
      setLoading(false);
      return;
    }

    setMessage("Note added.");
    setNoteBody("");
    setFollowUpRequired(false);
    setFollowUpAssignedToUserId("");
    setFollowUpSuspenseDate("");
    setFollowUpTaskDescription("");
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <TabButton active={activeTab === "activity"} onClick={() => setActiveTab("activity")}>
          Activity Information
        </TabButton>
        <TabButton active={activeTab === "donations"} onClick={() => setActiveTab("donations")}>
          Donations
        </TabButton>
        <TabButton active={activeTab === "notes"} onClick={() => setActiveTab("notes")}>
          Notes
        </TabButton>
        <button
          type="button"
          onClick={() => setActiveTab("tasks")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${taskTabClasses}`}
        >
          Tasks
        </button>
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {activeTab === "activity" ? (
        <div className="space-y-2">
          {activity.length === 0 ? (
            <p className="text-sm text-slate-500">No activity yet.</p>
          ) : (
            activity.map((entry) => (
              <article key={entry.id as string} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{entry.action_type as string}</span>
                  <span>{formatDate(entry.created_at as string)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{entry.action_summary as string}</p>
                <p className="mt-1 text-xs text-slate-500">{entry.entity_type as string}</p>
              </article>
            ))
          )}
        </div>
      ) : null}

      {activeTab === "donations" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            {donations.length === 0 ? (
              <p className="text-sm text-slate-500">No donations recorded.</p>
            ) : (
              donations.map((donation) => (
                <article
                  key={donation.id as string}
                  className="rounded-md border border-slate-200 p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">
                      {formatCurrency(Number(donation.amount ?? 0))}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(donation.donation_date as string)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-600">
                    {(donation.payment_type as string) ?? "-"} • Check:{" "}
                    {(donation.check_number as string) ?? "-"} • Txn:{" "}
                    {(donation.transaction_id as string) ?? "-"}
                  </p>
                </article>
              ))
            )}
          </div>

          <form onSubmit={submitDonation} className="rounded-md border border-slate-200 p-4">
            <p className="mb-2 text-sm font-semibold">Add Donation</p>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                type="date"
                value={donationForm.date}
                onChange={(event) =>
                  setDonationForm((prev) => ({ ...prev, date: event.target.value }))
                }
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={donationForm.amount}
                onChange={(event) =>
                  setDonationForm((prev) => ({ ...prev, amount: event.target.value }))
                }
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={donationForm.paymentType}
                onChange={(event) =>
                  setDonationForm((prev) => ({ ...prev, paymentType: event.target.value }))
                }
              >
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
                <option value="Card">Card</option>
              </select>
              {donationForm.paymentType === "Check" ? (
                <Input
                  placeholder="Check Number"
                  value={donationForm.checkNumber}
                  onChange={(event) =>
                    setDonationForm((prev) => ({ ...prev, checkNumber: event.target.value }))
                  }
                />
              ) : null}
              {donationForm.paymentType === "Card" ? (
                <Input
                  placeholder="Transaction ID"
                  value={donationForm.transactionId}
                  onChange={(event) =>
                    setDonationForm((prev) => ({ ...prev, transactionId: event.target.value }))
                  }
                />
              ) : null}
              <Input
                placeholder="Memo"
                value={donationForm.memo}
                onChange={(event) =>
                  setDonationForm((prev) => ({ ...prev, memo: event.target.value }))
                }
              />
            </div>
            <Button className="mt-3" type="submit" disabled={loading}>
              Add Donation
            </Button>
          </form>
        </div>
      ) : null}

      {activeTab === "notes" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            {notes.length === 0 ? (
              <p className="text-sm text-slate-500">No notes available.</p>
            ) : (
              notes.map((note) => (
                <article key={note.id as string} className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">
                    {formatDate(note.created_at as string)} • {(note.created_by as string) ?? "Unknown"}
                  </p>
                  <p className="mt-1 text-sm text-slate-800">{note.body as string}</p>
                </article>
              ))
            )}
          </div>

          <form onSubmit={submitNote} className="rounded-md border border-slate-200 p-4">
            <p className="mb-2 text-sm font-semibold">Add Note</p>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Write note details..."
            />
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={followUpRequired}
                onChange={(event) => setFollowUpRequired(event.target.checked)}
              />
              Follow Up Required
            </label>

            {followUpRequired ? (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={followUpAssignedToUserId}
                  onChange={(event) => setFollowUpAssignedToUserId(event.target.value)}
                >
                  <option value="">Assign staff member</option>
                  {staffUsers.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.user_id}
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={followUpSuspenseDate}
                  onChange={(event) => setFollowUpSuspenseDate(event.target.value)}
                />
                <Input
                  placeholder="Task description"
                  value={followUpTaskDescription}
                  onChange={(event) => setFollowUpTaskDescription(event.target.value)}
                />
              </div>
            ) : null}

            <Button className="mt-3" type="submit" disabled={loading}>
              Add Note
            </Button>
          </form>
        </div>
      ) : null}

      {activeTab === "tasks" ? (
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks linked to this contact.</p>
          ) : (
            tasks.map((task) => {
              const project = Array.isArray(task.projects)
                ? task.projects[0]
                : (task.projects as Record<string, unknown> | null);
              return (
                <article key={task.id as string} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">{task.title as string}</p>
                    <span className="text-xs text-slate-500">{formatDate(task.due_date as string)}</span>
                  </div>
                  <p className="text-sm text-slate-700">{(task.description as string) ?? "-"}</p>
                  <p className="text-xs text-slate-500">
                    {(task.status as string) ?? "-"} • {(task.priority as string) ?? "-"}{" "}
                    {project?.name ? `• Project: ${project.name as string}` : ""}
                  </p>
                </article>
              );
            })
          )}
        </div>
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
  children: ReactNode;
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
