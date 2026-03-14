"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  project_start_date: string | null;
  expected_end_date: string | null;
  owner_user_id: string | null;
  project_manager_user_id: string | null;
};

export type UserOption = {
  user_id: string;
  display_name: string | null;
};

export function ProjectsDashboard({
  projects,
  canCreate,
  users,
  detailBasePath = "/staff/projects/management"
}: {
  projects: ProjectRow[];
  canCreate: boolean;
  users: UserOption[];
  detailBasePath?: string;
}) {
  const [activeTab, setActiveTab] = useState<"active" | "completed" | "all">("active");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "on_hold" | "completed" | "cancelled">(
    "all"
  );
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const visibleProjects = useMemo(() => {
    return projects.filter((project) => {
      if (activeTab === "active" && !["active", "on_hold"].includes(project.status)) return false;
      if (activeTab === "completed" && project.status !== "completed") return false;
      if (statusFilter !== "all" && project.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const payload = `${project.name} ${project.description ?? ""} ${project.status}`.toLowerCase();
        if (!payload.includes(q)) return false;
      }
      return true;
    });
  }, [activeTab, statusFilter, search, projects]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <TabButton active={activeTab === "active"} onClick={() => setActiveTab("active")}>
            Active Projects
          </TabButton>
          <TabButton active={activeTab === "completed"} onClick={() => setActiveTab("completed")}>
            Completed Projects
          </TabButton>
          <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>
            All Projects
          </TabButton>
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => setShowModal(true)}>
            New Project
          </Button>
        ) : (
          <p className="text-xs text-amber-700">
            Only Administrators and Executive Leaders can create projects.
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as "all" | "active" | "on_hold" | "completed" | "cancelled"
            )
          }
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search projects..."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleProjects.length === 0 ? (
          <p className="text-sm text-slate-500">No projects match your filters.</p>
        ) : (
          visibleProjects.map((project) => (
            <Link
              key={project.id}
              href={`${detailBasePath}/${project.id}`}
              className="rounded-lg border border-slate-200 p-4 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{project.name}</p>
                <span className="text-xs text-slate-500">{project.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{project.description ?? "-"}</p>
              <p className="mt-2 text-xs text-slate-500">
                Start: {formatDate(project.project_start_date)}
              </p>
              <p className="text-xs text-slate-500">
                Expected End: {formatDate(project.expected_end_date)}
              </p>
            </Link>
          ))
        )}
      </div>

      {showModal ? (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          users={users}
          detailBasePath={detailBasePath}
        />
      ) : null}
    </div>
  );
}

function NewProjectModal({
  onClose,
  users,
  detailBasePath
}: {
  onClose: () => void;
  users: UserOption[];
  detailBasePath: string;
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "active",
    projectStartDate: "",
    expectedEndDate: "",
    projectManagerUserId: "",
    ownerUserId: ""
  });
  const [assignedStaff, setAssignedStaff] = useState<Array<{ userId: string; roleOnProject: string }>>(
    []
  );
  const [stakeholders, setStakeholders] = useState<
    Array<{
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
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addStaffRow() {
    setAssignedStaff((prev) => [...prev, { userId: "", roleOnProject: "Team Member" }]);
  }

  function addStakeholderRow() {
    setStakeholders((prev) => [
      ...prev,
      {
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
      }
    ]);
  }

  async function submitProject(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        assignedStaff: assignedStaff.filter((entry) => entry.userId),
        stakeholders: stakeholders.filter((entry) => entry.stakeholderName.trim())
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to create project.");
      setLoading(false);
      return;
    }
    window.location.href = `${detailBasePath}/${payload.id as string}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">New Project</h3>
          <button
            type="button"
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <form onSubmit={submitProject} className="space-y-4">
          <section className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold">Project Information</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Project name"
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <Input
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Description"
              />
              <Input
                type="date"
                value={form.projectStartDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, projectStartDate: event.target.value }))
                }
              />
              <Input
                type="date"
                value={form.expectedEndDate}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, expectedEndDate: event.target.value }))
                }
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.projectManagerUserId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, projectManagerUserId: event.target.value }))
                }
              >
                <option value="">Project Manager</option>
                {users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.display_name ?? user.user_id}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.ownerUserId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
                }
              >
                <option value="">Project Owner</option>
                {users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.display_name ?? user.user_id}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Assigned Staff</p>
              <Button type="button" variant="secondary" onClick={addStaffRow}>
                Add Staff
              </Button>
            </div>
            <div className="space-y-2">
              {assignedStaff.map((entry, idx) => (
                <div key={`${idx}-${entry.userId}`} className="grid gap-2 md:grid-cols-2">
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={entry.userId}
                    onChange={(event) =>
                      setAssignedStaff((prev) =>
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
                      setAssignedStaff((prev) =>
                        prev.map((row, rowIdx) =>
                          rowIdx === idx ? { ...row, roleOnProject: event.target.value } : row
                        )
                      )
                    }
                    placeholder="Role on project"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Stakeholder Matrix</p>
              <Button type="button" variant="secondary" onClick={addStakeholderRow}>
                Add Stakeholder
              </Button>
            </div>
            <div className="space-y-2">
              {stakeholders.map((entry, idx) => (
                <div key={`${idx}-${entry.stakeholderName}`} className="grid gap-2 md:grid-cols-2">
                  <Input
                    value={entry.stakeholderName}
                    onChange={(event) =>
                      setStakeholders((prev) =>
                        prev.map((row, rowIdx) =>
                          rowIdx === idx ? { ...row, stakeholderName: event.target.value } : row
                        )
                      )
                    }
                    placeholder="Stakeholder Name"
                  />
                  <Input
                    value={entry.stakeholderRoleTitle}
                    onChange={(event) =>
                      setStakeholders((prev) =>
                        prev.map((row, rowIdx) =>
                          rowIdx === idx
                            ? { ...row, stakeholderRoleTitle: event.target.value }
                            : row
                        )
                      )
                    }
                    placeholder="Role / Title"
                  />
                  <Input
                    value={entry.organization}
                    onChange={(event) =>
                      setStakeholders((prev) =>
                        prev.map((row, rowIdx) =>
                          rowIdx === idx ? { ...row, organization: event.target.value } : row
                        )
                      )
                    }
                    placeholder="Organization"
                  />
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={entry.stakeholderType}
                    onChange={(event) =>
                      setStakeholders((prev) =>
                        prev.map((row, rowIdx) =>
                          rowIdx === idx
                            ? {
                                ...row,
                                stakeholderType: event.target.value as "Internal" | "External"
                              }
                            : row
                        )
                      )
                    }
                  >
                    <option value="Internal">Internal</option>
                    <option value="External">External</option>
                  </select>
                  <Input
                    value={entry.influenceLevel}
                    onChange={(event) =>
                      setStakeholders((prev) =>
                        prev.map((row, rowIdx) =>
                          rowIdx === idx ? { ...row, influenceLevel: event.target.value } : row
                        )
                      )
                    }
                    placeholder="Influence level"
                  />
                  <Input
                    value={entry.interestLevel}
                    onChange={(event) =>
                      setStakeholders((prev) =>
                        prev.map((row, rowIdx) =>
                          rowIdx === idx ? { ...row, interestLevel: event.target.value } : row
                        )
                      )
                    }
                    placeholder="Interest level"
                  />
                </div>
              ))}
            </div>
          </section>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button disabled={loading} type="submit">
            {loading ? "Saving..." : "Create Project"}
          </Button>
        </form>
      </div>
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
