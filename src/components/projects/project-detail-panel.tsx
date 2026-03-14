"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type UserOption = { user_id: string; display_name: string | null };

export function ProjectDetailPanel({
  project,
  groupedTasks,
  staff,
  stakeholders,
  users
}: {
  project: Record<string, unknown>;
  groupedTasks: Record<string, Array<Record<string, unknown>>>;
  staff: Array<Record<string, unknown>>;
  stakeholders: Array<Record<string, unknown>>;
  users: UserOption[];
}) {
  const [staffRows, setStaffRows] = useState(staff);
  const [stakeholderRows, setStakeholderRows] = useState(stakeholders);
  const [newStaff, setNewStaff] = useState({ userId: "", roleOnProject: "Team Member" });
  const [newStakeholder, setNewStakeholder] = useState({
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
  const [saving, setSaving] = useState(false);

  async function addStaff() {
    if (!newStaff.userId) return;
    setSaving(true);
    const response = await fetch(`/api/projects/${project.id as string}/staff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newStaff)
    });
    if (response.ok) {
      setStaffRows((prev) => [...prev, { user_id: newStaff.userId, role_on_project: newStaff.roleOnProject }]);
      setNewStaff({ userId: "", roleOnProject: "Team Member" });
    }
    setSaving(false);
  }

  async function addStakeholder() {
    if (!newStakeholder.stakeholderName.trim()) return;
    setSaving(true);
    const response = await fetch(`/api/projects/${project.id as string}/stakeholders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newStakeholder)
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setStakeholderRows((prev) => [...prev, { ...newStakeholder, id: payload?.id }]);
      setNewStakeholder({
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

  async function removeStakeholder(stakeholderId: string) {
    setSaving(true);
    const response = await fetch(
      `/api/projects/${project.id as string}/stakeholders/${stakeholderId}`,
      { method: "DELETE" }
    );
    if (response.ok) {
      setStakeholderRows((prev) => prev.filter((row) => String(row.id) !== stakeholderId));
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="text-sm font-semibold">Project Details</h4>
        <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
          <p>Status: {project.status as string}</p>
          <p>Start: {formatDate(project.project_start_date as string)}</p>
          <p>Expected End: {formatDate(project.expected_end_date as string)}</p>
          <p>Project Manager: {(project.project_manager_user_id as string) ?? "-"}</p>
          <p>Owner: {(project.owner_user_id as string) ?? "-"}</p>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="text-sm font-semibold">Assigned Staff Members</h4>
        <div className="mt-2 space-y-2">
          {staffRows.map((member) => (
            <p key={`${String(member.user_id)}-${String(member.role_on_project)}`} className="text-sm">
              {String(member.user_id)} • {String(member.role_on_project)}
            </p>
          ))}
          {staffRows.length === 0 ? <p className="text-sm text-slate-500">No staff assigned yet.</p> : null}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={newStaff.userId}
            onChange={(event) => setNewStaff((prev) => ({ ...prev, userId: event.target.value }))}
          >
            <option value="">Select user</option>
            {users.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name ?? user.user_id}
              </option>
            ))}
          </select>
          <Input
            value={newStaff.roleOnProject}
            onChange={(event) =>
              setNewStaff((prev) => ({ ...prev, roleOnProject: event.target.value }))
            }
            placeholder="Role on project"
          />
          <Button type="button" variant="secondary" onClick={addStaff} disabled={saving}>
            Add Staff
          </Button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="text-sm font-semibold">Stakeholder Matrix</h4>
        <div className="mt-2 space-y-2">
          {stakeholderRows.map((row) => (
            <div key={String(row.id)} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  {String(row.stakeholder_name ?? row.stakeholderName ?? "-")}
                </p>
                {row.id ? (
                  <button
                    type="button"
                    className="text-xs text-red-700"
                    onClick={() => removeStakeholder(String(row.id))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-slate-600">
                {String(row.stakeholder_role_title ?? row.stakeholderRoleTitle ?? "-")} •{" "}
                {String(row.stakeholder_organization ?? row.organization ?? "-")} •{" "}
                {String(row.stakeholder_type ?? row.stakeholderType ?? "-")}
              </p>
              <p className="text-xs text-slate-500">
                Influence {String(row.influence_level ?? row.influenceLevel ?? "-")} / Interest{" "}
                {String(row.interest_level ?? row.interestLevel ?? "-")} / Support{" "}
                {String(row.support_level ?? row.supportLevel ?? "-")}
              </p>
            </div>
          ))}
          {stakeholderRows.length === 0 ? (
            <p className="text-sm text-slate-500">No stakeholders mapped yet.</p>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Input
            value={newStakeholder.stakeholderName}
            onChange={(event) =>
              setNewStakeholder((prev) => ({ ...prev, stakeholderName: event.target.value }))
            }
            placeholder="Stakeholder Name"
          />
          <Input
            value={newStakeholder.stakeholderRoleTitle}
            onChange={(event) =>
              setNewStakeholder((prev) => ({
                ...prev,
                stakeholderRoleTitle: event.target.value
              }))
            }
            placeholder="Role / Title"
          />
          <Input
            value={newStakeholder.organization}
            onChange={(event) =>
              setNewStakeholder((prev) => ({ ...prev, organization: event.target.value }))
            }
            placeholder="Organization"
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={newStakeholder.stakeholderType}
            onChange={(event) =>
              setNewStakeholder((prev) => ({
                ...prev,
                stakeholderType: event.target.value
              }))
            }
          >
            <option value="External">External</option>
            <option value="Internal">Internal</option>
          </select>
          <Input
            value={newStakeholder.influenceLevel}
            onChange={(event) =>
              setNewStakeholder((prev) => ({ ...prev, influenceLevel: event.target.value }))
            }
            placeholder="Influence Level"
          />
          <Input
            value={newStakeholder.interestLevel}
            onChange={(event) =>
              setNewStakeholder((prev) => ({ ...prev, interestLevel: event.target.value }))
            }
            placeholder="Interest Level"
          />
        </div>
        <Button className="mt-3" type="button" variant="secondary" onClick={addStakeholder} disabled={saving}>
          Add Stakeholder
        </Button>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="text-sm font-semibold">Project Tasks</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TaskGroup title="Overdue" rows={groupedTasks.overdue ?? []} />
          <TaskGroup title="Upcoming" rows={groupedTasks.upcoming ?? []} />
          <TaskGroup title="Completed" rows={groupedTasks.completed ?? []} />
          <TaskGroup title="Canceled" rows={groupedTasks.cancelled ?? []} />
        </div>
      </section>
    </div>
  );
}

function TaskGroup({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="space-y-1">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">No tasks</p>
        ) : (
          rows.map((task) => (
            <Link
              key={String(task.id)}
              href={`/staff/tasks/${String(task.id)}`}
              className="block rounded-md border border-slate-100 px-2 py-1 hover:bg-slate-50"
            >
              <p className="text-xs font-medium text-slate-900">{String(task.title ?? "-")}</p>
              <p className="text-[11px] text-slate-500">
                {String(task.status ?? "-")} • Due {formatDate(task.due_date as string)}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
