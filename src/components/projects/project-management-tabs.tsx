"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type UserOption = { user_id: string; display_name: string | null };

type StakeholderForm = {
  stakeholderName: string;
  stakeholderRoleTitle: string;
  organization: string;
  stakeholderType: "Internal" | "External";
  influenceLevel: string;
  interestLevel: string;
  supportLevel: string;
  engagementStrategy: string;
  communicationNeeds: string;
  ownerUserId: string;
  contactInfo: string;
};

function effectiveStatus(task: Record<string, unknown>) {
  const status = String(task.status ?? "todo");
  const completedAt = task.completed_at as string | null | undefined;
  const dueDate = task.due_date as string | null | undefined;
  if (completedAt || status === "completed") return "Completed";
  if (status === "cancelled") return "Canceled";
  if (dueDate && new Date(dueDate) < new Date()) return "Overdue";
  if (status === "in_progress") return "In Progress";
  return "Open";
}

export function ProjectManagementTabs({
  project,
  tasks,
  groupedTasks,
  staff,
  stakeholders,
  users
}: {
  project: Record<string, unknown>;
  tasks: Array<Record<string, unknown>>;
  groupedTasks: Record<string, Array<Record<string, unknown>>>;
  staff: Array<Record<string, unknown>>;
  stakeholders: Array<Record<string, unknown>>;
  users: UserOption[];
}) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "tasks_gallery" | "tasks_report" | "stakeholder_matrix"
  >("overview");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "in_progress" | "completed" | "overdue" | "canceled"
  >("all");
  const [rows, setRows] = useState(stakeholders);
  const [showNewStakeholder, setShowNewStakeholder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StakeholderForm>({
    stakeholderName: "",
    stakeholderRoleTitle: "",
    organization: "",
    stakeholderType: "External",
    influenceLevel: "",
    interestLevel: "",
    supportLevel: "",
    engagementStrategy: "",
    communicationNeeds: "",
    ownerUserId: "",
    contactInfo: ""
  });

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users) {
      map.set(user.user_id, user.display_name || user.user_id);
    }
    return map;
  }, [users]);

  const filteredTasks = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((task) => {
      const effective = effectiveStatus(task);
      if (statusFilter === "open") return effective === "Open";
      if (statusFilter === "in_progress") return effective === "In Progress";
      if (statusFilter === "completed") return effective === "Completed";
      if (statusFilter === "overdue") return effective === "Overdue";
      if (statusFilter === "canceled") return effective === "Canceled";
      return true;
    });
  }, [tasks, statusFilter]);

  async function createStakeholder(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch(`/api/projects/${project.id as string}/stakeholders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setRows((prev) => [...prev, { ...form, id: payload?.id }]);
      setShowNewStakeholder(false);
      setForm({
        stakeholderName: "",
        stakeholderRoleTitle: "",
        organization: "",
        stakeholderType: "External",
        influenceLevel: "",
        interestLevel: "",
        supportLevel: "",
        engagementStrategy: "",
        communicationNeeds: "",
        ownerUserId: "",
        contactInfo: ""
      });
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={activeTab === "tasks_gallery"} onClick={() => setActiveTab("tasks_gallery")}>
          Tasks Gallery
        </TabButton>
        <TabButton active={activeTab === "tasks_report"} onClick={() => setActiveTab("tasks_report")}>
          Tasks Report
        </TabButton>
        <TabButton
          active={activeTab === "stakeholder_matrix"}
          onClick={() => setActiveTab("stakeholder_matrix")}
        >
          Stakeholder Matrix
        </TabButton>
      </div>

      {activeTab === "overview" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Project Overview</h4>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p className="text-slate-500">Project Name</p>
              <p>{String(project.name ?? "-")}</p>
            </div>
            <div>
              <p className="text-slate-500">Status</p>
              <p>{String(project.status ?? "-")}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-slate-500">Description</p>
              <p>{String(project.description ?? "-")}</p>
            </div>
            <div>
              <p className="text-slate-500">Project Start Date</p>
              <p>{formatDate(project.project_start_date as string)}</p>
            </div>
            <div>
              <p className="text-slate-500">Projected End Date</p>
              <p>{formatDate(project.expected_end_date as string)}</p>
            </div>
            <div>
              <p className="text-slate-500">Project Owner</p>
              <p>{userNameById.get(String(project.owner_user_id ?? "")) ?? String(project.owner_user_id ?? "-")}</p>
            </div>
            <div>
              <p className="text-slate-500">Project Manager</p>
              <p>
                {userNameById.get(String(project.project_manager_user_id ?? "")) ??
                  String(project.project_manager_user_id ?? "-")}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-slate-500">Assigned Staff Members</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {staff.length === 0 ? (
                  <span className="text-sm text-slate-500">No staff assigned</span>
                ) : (
                  staff.map((member) => (
                    <span
                      key={`${String(member.id)}`}
                      className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                    >
                      {userNameById.get(String(member.user_id ?? "")) ?? String(member.user_id ?? "-")} •{" "}
                      {String(member.role_on_project ?? "-")}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "tasks_gallery" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900">Tasks Gallery</h4>
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | "all"
                    | "open"
                    | "in_progress"
                    | "completed"
                    | "overdue"
                    | "canceled"
                )
              }
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>

          {filteredTasks.length === 0 ? (
            <p className="text-sm text-slate-500">No tasks for selected filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Task Title</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Assigned User</th>
                    <th className="py-2">Due Date</th>
                    <th className="py-2">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <tr key={String(task.id)} className="border-b border-slate-100">
                      <td className="py-2">
                        <Link href={`/staff/tasks/${String(task.id)}`} className="font-medium text-brand-700">
                          {String(task.title ?? "-")}
                        </Link>
                      </td>
                      <td className="py-2">{effectiveStatus(task)}</td>
                      <td className="py-2">
                        {userNameById.get(String(task.assigned_to ?? "")) ?? String(task.assigned_to ?? "-")}
                      </td>
                      <td className="py-2">{formatDate(task.due_date as string)}</td>
                      <td className="py-2">{String(task.priority ?? "-")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "tasks_report" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-900">Tasks Report</h4>
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryBox label="Overdue" value={(groupedTasks.overdue ?? []).length} tone="red" />
            <SummaryBox label="Upcoming" value={(groupedTasks.upcoming ?? []).length} tone="amber" />
            <SummaryBox label="Completed" value={(groupedTasks.completed ?? []).length} tone="green" />
            <SummaryBox label="Canceled" value={(groupedTasks.cancelled ?? []).length} tone="slate" />
          </div>
        </section>
      ) : null}

      {activeTab === "stakeholder_matrix" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900">Stakeholder Matrix</h4>
            <Button type="button" onClick={() => setShowNewStakeholder(true)}>
              New
            </Button>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">No stakeholder records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Stakeholder Name</th>
                    <th className="py-2">Role / Title</th>
                    <th className="py-2">Organization</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Influence</th>
                    <th className="py-2">Interest</th>
                    <th className="py-2">Support</th>
                    <th className="py-2">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)} className="border-b border-slate-100">
                      <td className="py-2">{String(row.stakeholder_name ?? row.stakeholderName ?? "-")}</td>
                      <td className="py-2">
                        {String(row.stakeholder_role_title ?? row.stakeholderRoleTitle ?? "-")}
                      </td>
                      <td className="py-2">
                        {String(row.stakeholder_organization ?? row.organization ?? "-")}
                      </td>
                      <td className="py-2">{String(row.stakeholder_type ?? row.stakeholderType ?? "-")}</td>
                      <td className="py-2">{String(row.influence_level ?? row.influenceLevel ?? "-")}</td>
                      <td className="py-2">{String(row.interest_level ?? row.interestLevel ?? "-")}</td>
                      <td className="py-2">{String(row.support_level ?? row.supportLevel ?? "-")}</td>
                      <td className="py-2">
                        {userNameById.get(
                          String(row.owner_user_id ?? row.ownerUserId ?? "")
                        ) ?? String(row.owner_user_id ?? row.ownerUserId ?? "-")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {showNewStakeholder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-base font-semibold text-slate-900">New Stakeholder</h5>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setShowNewStakeholder(false)}
              >
                Close
              </button>
            </div>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={createStakeholder}>
              <Input
                placeholder="Stakeholder Name"
                value={form.stakeholderName}
                onChange={(event) => setForm((prev) => ({ ...prev, stakeholderName: event.target.value }))}
              />
              <Input
                placeholder="Role / Title"
                value={form.stakeholderRoleTitle}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stakeholderRoleTitle: event.target.value }))
                }
              />
              <Input
                placeholder="Organization"
                value={form.organization}
                onChange={(event) => setForm((prev) => ({ ...prev, organization: event.target.value }))}
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.stakeholderType}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    stakeholderType: event.target.value as "Internal" | "External"
                  }))
                }
              >
                <option value="External">External</option>
                <option value="Internal">Internal</option>
              </select>
              <Input
                placeholder="Influence Level"
                value={form.influenceLevel}
                onChange={(event) => setForm((prev) => ({ ...prev, influenceLevel: event.target.value }))}
              />
              <Input
                placeholder="Interest Level"
                value={form.interestLevel}
                onChange={(event) => setForm((prev) => ({ ...prev, interestLevel: event.target.value }))}
              />
              <Input
                placeholder="Support Level"
                value={form.supportLevel}
                onChange={(event) => setForm((prev) => ({ ...prev, supportLevel: event.target.value }))}
              />
              <Input
                placeholder="Engagement Strategy"
                value={form.engagementStrategy}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, engagementStrategy: event.target.value }))
                }
              />
              <Input
                placeholder="Communication Needs / Notes"
                value={form.communicationNeeds}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, communicationNeeds: event.target.value }))
                }
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.ownerUserId}
                onChange={(event) => setForm((prev) => ({ ...prev, ownerUserId: event.target.value }))}
              >
                <option value="">Owner / Responsible Staff</option>
                {users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.display_name ?? user.user_id}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Contact Information"
                value={form.contactInfo}
                onChange={(event) => setForm((prev) => ({ ...prev, contactInfo: event.target.value }))}
              />
              <div className="md:col-span-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Create Stakeholder"}
                </Button>
              </div>
            </form>
          </div>
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

function SummaryBox({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "slate";
}) {
  const colorClass =
    tone === "red"
      ? "bg-red-50 text-red-800"
      : tone === "amber"
        ? "bg-amber-50 text-amber-800"
        : tone === "green"
          ? "bg-green-50 text-green-800"
          : "bg-slate-100 text-slate-800";

  return (
    <div className={`rounded-md border border-slate-200 p-3 ${colorClass}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
