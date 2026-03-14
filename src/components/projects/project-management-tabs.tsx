"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
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
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "stakeholder_matrix">("overview");
  const [projectState, setProjectState] = useState(project);
  const [staffRows, setStaffRows] = useState(staff);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "in_progress" | "completed" | "overdue" | "canceled"
  >("all");
  const [showEditProject, setShowEditProject] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: String(project.name ?? ""),
    description: String(project.description ?? ""),
    status: String(project.status ?? "active"),
    projectStartDate: String(project.project_start_date ?? ""),
    expectedEndDate: String(project.expected_end_date ?? ""),
    ownerUserId: String(project.owner_user_id ?? ""),
    projectManagerUserId: String(project.project_manager_user_id ?? "")
  });
  const [projectStaffForm, setProjectStaffForm] = useState<
    Array<{ userId: string; roleOnProject: string }>
  >(
    staff.map((member) => ({
      userId: String(member.user_id ?? ""),
      roleOnProject: String(member.role_on_project ?? "Team Member")
    }))
  );
  const [projectSaveError, setProjectSaveError] = useState<string | null>(null);

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

  function resetProjectForm() {
    setProjectForm({
      name: String(projectState.name ?? ""),
      description: String(projectState.description ?? ""),
      status: String(projectState.status ?? "active"),
      projectStartDate: String(projectState.project_start_date ?? ""),
      expectedEndDate: String(projectState.expected_end_date ?? ""),
      ownerUserId: String(projectState.owner_user_id ?? ""),
      projectManagerUserId: String(projectState.project_manager_user_id ?? "")
    });
    setProjectStaffForm(
      staffRows.map((member) => ({
        userId: String(member.user_id ?? ""),
        roleOnProject: String(member.role_on_project ?? "Team Member")
      }))
    );
    setProjectSaveError(null);
  }

  function addProjectStaffRow() {
    setProjectStaffForm((prev) => [...prev, { userId: "", roleOnProject: "Team Member" }]);
  }

  async function saveProjectEdits(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setProjectSaveError(null);

    const assignedStaff = projectStaffForm
      .filter((row) => row.userId)
      .map((row) => ({ userId: row.userId, roleOnProject: row.roleOnProject || "Team Member" }));

    const response = await fetch(`/api/projects/${String(projectState.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...projectForm,
        assignedStaff
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setProjectSaveError(payload?.message ?? "Unable to save project changes.");
      setSaving(false);
      return;
    }

    setProjectState((prev) => ({
      ...prev,
      name: projectForm.name,
      description: projectForm.description || null,
      status: projectForm.status,
      project_start_date: projectForm.projectStartDate || null,
      expected_end_date: projectForm.expectedEndDate || null,
      owner_user_id: projectForm.ownerUserId || null,
      project_manager_user_id: projectForm.projectManagerUserId || null
    }));
    setStaffRows(
      assignedStaff.map((entry) => ({
        id: `${entry.userId}-${entry.roleOnProject}`,
        user_id: entry.userId,
        role_on_project: entry.roleOnProject
      }))
    );
    setSaving(false);
    setShowEditProject(false);
  }

  async function createStakeholder(event: FormEvent) {
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
        <TabButton active={activeTab === "tasks"} onClick={() => setActiveTab("tasks")}>
          Tasks
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-900">Project Overview</h4>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetProjectForm();
                setShowEditProject(true);
              }}
            >
              Edit Project
            </Button>
          </div>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <p className="text-slate-500">Project Name</p>
              <p>{String(projectState.name ?? "-")}</p>
            </div>
            <div>
              <p className="text-slate-500">Status</p>
              <p>{String(projectState.status ?? "-")}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-slate-500">Description</p>
              <p>{String(projectState.description ?? "-")}</p>
            </div>
            <div>
              <p className="text-slate-500">Project Start Date</p>
              <p>{formatDate(projectState.project_start_date as string)}</p>
            </div>
            <div>
              <p className="text-slate-500">Projected End Date</p>
              <p>{formatDate(projectState.expected_end_date as string)}</p>
            </div>
            <div>
              <p className="text-slate-500">Project Owner</p>
              <p>
                {userNameById.get(String(projectState.owner_user_id ?? "")) ??
                  String(projectState.owner_user_id ?? "-")}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Project Manager</p>
              <p>
                {userNameById.get(String(projectState.project_manager_user_id ?? "")) ??
                  String(projectState.project_manager_user_id ?? "-")}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-slate-500">Assigned Staff Members</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {staffRows.length === 0 ? (
                  <span className="text-sm text-slate-500">No staff assigned</span>
                ) : (
                  staffRows.map((member) => (
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

      {activeTab === "tasks" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-900">Tasks</h4>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <SummaryBox label="Overdue" value={(groupedTasks.overdue ?? []).length} tone="red" />
            <SummaryBox label="Upcoming" value={(groupedTasks.upcoming ?? []).length} tone="amber" />
            <SummaryBox label="Completed" value={(groupedTasks.completed ?? []).length} tone="green" />
            <SummaryBox label="Canceled" value={(groupedTasks.cancelled ?? []).length} tone="slate" />
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <h5 className="text-sm font-semibold text-slate-900">Task List</h5>
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

      {showEditProject ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-base font-semibold text-slate-900">Edit Project</h5>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setShowEditProject(false)}
              >
                Close
              </button>
            </div>
            <form onSubmit={saveProjectEdits} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  value={projectForm.name}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Project name"
                />
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={projectForm.status}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <Input
                  value={projectForm.description}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Description"
                />
                <Input
                  type="date"
                  value={projectForm.projectStartDate}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, projectStartDate: event.target.value }))
                  }
                />
                <Input
                  type="date"
                  value={projectForm.expectedEndDate}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, expectedEndDate: event.target.value }))
                  }
                />
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={projectForm.ownerUserId}
                  onChange={(event) =>
                    setProjectForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
                  }
                >
                  <option value="">Project Owner</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name ?? user.user_id}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={projectForm.projectManagerUserId}
                  onChange={(event) =>
                    setProjectForm((prev) => ({
                      ...prev,
                      projectManagerUserId: event.target.value
                    }))
                  }
                >
                  <option value="">Project Manager</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name ?? user.user_id}
                    </option>
                  ))}
                </select>
              </div>

              <section className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Assigned Staff</p>
                  <Button type="button" variant="secondary" onClick={addProjectStaffRow}>
                    Add Staff
                  </Button>
                </div>
                <div className="space-y-2">
                  {projectStaffForm.length === 0 ? (
                    <p className="text-sm text-slate-500">No assigned staff yet.</p>
                  ) : (
                    projectStaffForm.map((entry, idx) => (
                      <div key={`${idx}-${entry.userId}`} className="grid gap-2 md:grid-cols-3">
                        <select
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={entry.userId}
                          onChange={(event) =>
                            setProjectStaffForm((prev) =>
                              prev.map((row, rowIdx) =>
                                rowIdx === idx ? { ...row, userId: event.target.value } : row
                              )
                            )
                          }
                        >
                          <option value="">Select user</option>
                          {users.map((user) => (
                            <option key={user.user_id} value={user.user_id}>
                              {user.display_name ?? user.user_id}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={entry.roleOnProject}
                          onChange={(event) =>
                            setProjectStaffForm((prev) =>
                              prev.map((row, rowIdx) =>
                                rowIdx === idx
                                  ? { ...row, roleOnProject: event.target.value }
                                  : row
                              )
                            )
                          }
                          placeholder="Role on project"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            setProjectStaffForm((prev) =>
                              prev.filter((_, rowIdx) => rowIdx !== idx)
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {projectSaveError ? <p className="text-sm text-red-700">{projectSaveError}</p> : null}
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Project"}
              </Button>
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
