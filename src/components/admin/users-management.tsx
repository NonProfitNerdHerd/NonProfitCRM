"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roleOrderScore } from "@/lib/auth/role-hierarchy";

type RoleTemplate = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
};

type UserRow = {
  user_id: string;
  is_active: boolean;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  username: string;
  roles: Array<{ id: string; key: string; name: string }>;
};

type UserFormState = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  username: string;
  isActive: boolean;
  roleTemplateIds: string[];
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatApiError(payload: unknown, fallback: string) {
  const value = (payload ?? {}) as {
    message?: string;
    details?: string | null;
    hint?: string | null;
    code?: string | null;
  };
  const parts = [value.message, value.details, value.hint, value.code].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : fallback;
}

export function UsersManagement({
  initialUsers,
  roles,
  canManageUsers = true
}: {
  initialUsers: UserRow[];
  roles: RoleTemplate[];
  canManageUsers?: boolean;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "role" | "status">("name");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [creating, setCreating] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copiedTempPassword, setCopiedTempPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [allowAdminRemoval, setAllowAdminRemoval] = useState(false);
  const [createForm, setCreateForm] = useState<UserFormState>({
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    username: "",
    isActive: true,
    roleTemplateIds: [] as string[]
  });
  const [editForm, setEditForm] = useState<UserFormState>({
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    username: "",
    isActive: true,
    roleTemplateIds: [] as string[]
  });

  const administratorRoleId = roles.find((role) => role.key === "administrator")?.id ?? null;
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = users.filter((user) => {
      if (statusFilter === "active" && !user.is_active) return false;
      if (statusFilter === "inactive" && user.is_active) return false;
      if (!query) return true;
      const searchPayload = [
        user.display_name,
        `${user.first_name} ${user.last_name}`.trim(),
        user.email,
        user.username,
        user.roles.map((role) => role.name).join(" ")
      ]
        .join(" ")
        .toLowerCase();
      return searchPayload.includes(query);
    });

    return rows.sort((a, b) => {
      if (sortBy === "status") {
        return Number(b.is_active) - Number(a.is_active);
      }
      if (sortBy === "role") {
        const aRole = a.roles.map((role) => role.name).join(", ");
        const bRole = b.roles.map((role) => role.name).join(", ");
        return aRole.localeCompare(bRole);
      }
      const aName = (a.display_name || `${a.first_name} ${a.last_name}`).trim();
      const bName = (b.display_name || `${b.first_name} ${b.last_name}`).trim();
      return aName.localeCompare(bName);
    });
  }, [search, sortBy, statusFilter, users]);

  async function refreshUsers() {
    const refreshed = await fetch("/api/admin/users");
    const payload = await refreshed.json().catch(() => null);
    if (refreshed.ok) {
      setUsers(payload?.users ?? []);
    }
  }

  function validateForm(form: UserFormState, userId?: string) {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return "First Name and Last Name are required.";
    }
    if (!isValidEmail(form.email.trim())) {
      return "Please enter a valid email address.";
    }
    if (form.roleTemplateIds.length === 0) {
      return "At least one role is required.";
    }

    const normalizedEmail = form.email.trim().toLowerCase();
    const duplicateEmail = users.some(
      (row) => row.user_id !== userId && row.email.trim().toLowerCase() === normalizedEmail
    );
    if (duplicateEmail) {
      return "A user with this email already exists.";
    }

    const normalizedUsername = form.username.trim().toLowerCase();
    if (normalizedUsername) {
      const duplicateUsername = users.some(
        (row) =>
          row.user_id !== userId &&
          (row.username || "").trim().toLowerCase() === normalizedUsername
      );
      if (duplicateUsername) {
        return "A user with this username already exists.";
      }
    }

    return null;
  }

  function openEditModal(user: UserRow) {
    setEditingUser(user);
    setAllowAdminRemoval(false);
    setEditForm({
      firstName: user.first_name,
      lastName: user.last_name,
      displayName: user.display_name,
      email: user.email,
      username: user.username,
      isActive: user.is_active,
      roleTemplateIds: user.roles.map((role) => role.id)
    });
    setError(null);
    setMessage(null);
    setCredentialMessage(null);
    setTemporaryPassword(null);
    setCopiedTempPassword(false);
  }

  function closeCreateModal() {
    setIsCreateOpen(false);
    setCreateForm({
      firstName: "",
      lastName: "",
      displayName: "",
      email: "",
      username: "",
      isActive: true,
      roleTemplateIds: []
    });
  }

  function closeEditModal() {
    setEditingUser(null);
    setAllowAdminRemoval(false);
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);
    setCredentialMessage(null);
    setTemporaryPassword(null);
    setCopiedTempPassword(false);

    const validationError = validateForm(createForm);
    if (validationError) {
      setError(validationError);
      setCreating(false);
      return;
    }

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...createForm,
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        displayName: createForm.displayName.trim(),
        email: createForm.email.trim(),
        username: createForm.username.trim() || undefined
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(formatApiError(payload, "Failed to create user."));
      setCreating(false);
      return;
    }

    await refreshUsers();
    closeCreateModal();
    setMessage("User created successfully.");
    if (payload?.temporaryPassword) {
      setTemporaryPassword(String(payload.temporaryPassword));
      setCopiedTempPassword(false);
      setCredentialMessage(
        `Temporary password for ${createForm.email.trim()}: ${String(payload.temporaryPassword)} (user must change this at first login).`
      );
    } else {
      setTemporaryPassword(null);
    }
    setCreating(false);
  }

  async function saveUserEdits(event: FormEvent) {
    event.preventDefault();
    if (!editingUser) return;
    setSavingUserId(editingUser.user_id);
    setError(null);
    setMessage(null);
    setCredentialMessage(null);
    setTemporaryPassword(null);
    setCopiedTempPassword(false);

    const validationError = validateForm(editForm, editingUser.user_id);
    if (validationError) {
      setError(validationError);
      setSavingUserId(null);
      return;
    }

    const hadAdministratorRole =
      administratorRoleId !== null &&
      editingUser.roles.some((role) => role.id === administratorRoleId);
    const hasAdministratorRoleNow =
      administratorRoleId !== null && editForm.roleTemplateIds.includes(administratorRoleId);
    if (hadAdministratorRole && !hasAdministratorRoleNow && !allowAdminRemoval) {
      setError(
        "This user currently has Administrator role. Check confirmation below to remove it."
      );
      setSavingUserId(null);
      return;
    }

    const response = await fetch(`/api/admin/users/${editingUser.user_id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        displayName: editForm.displayName.trim(),
        email: editForm.email.trim(),
        username: editForm.username.trim() || undefined,
        isActive: editForm.isActive,
        roleTemplateIds: editForm.roleTemplateIds
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(formatApiError(payload, "Failed to update user."));
      setSavingUserId(null);
      return;
    }

    await refreshUsers();
    closeEditModal();
    setMessage("User and role updated successfully.");
    setSavingUserId(null);
  }

  async function resetPasswordForUser() {
    if (!editingUser) return;
    setSavingUserId(editingUser.user_id);
    setError(null);
    setMessage(null);
    setCredentialMessage(null);

    const response = await fetch(`/api/admin/users/${editingUser.user_id}/reset-password`, {
      method: "POST"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(formatApiError(payload, "Failed to reset password."));
      setSavingUserId(null);
      return;
    }

    setCredentialMessage(
      `Temporary password for ${editingUser.email || editingUser.user_id}: ${String(
        payload?.temporaryPassword ?? ""
      )} (user must change this at first login).`
    );
    setTemporaryPassword(String(payload?.temporaryPassword ?? ""));
    setCopiedTempPassword(false);
    setMessage("Password reset successfully.");
    setSavingUserId(null);
  }

  async function copyTemporaryPassword() {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopiedTempPassword(true);
    } catch {
      setError("Unable to copy password automatically. Please copy it manually.");
    }
  }

  function toggleCreateRole(roleId: string) {
    setCreateForm((prev) => ({
      ...prev,
      roleTemplateIds: prev.roleTemplateIds.includes(roleId)
        ? prev.roleTemplateIds.filter((id) => id !== roleId)
        : [...prev.roleTemplateIds, roleId]
    }));
  }

  function toggleEditRole(roleId: string) {
    setEditForm((prev) => ({
      ...prev,
      roleTemplateIds: prev.roleTemplateIds.includes(roleId)
        ? prev.roleTemplateIds.filter((id) => id !== roleId)
        : [...prev.roleTemplateIds, roleId]
    }));
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Users</h3>
          <p className="text-xs text-slate-600">
            {canManageUsers
              ? "View, create, and manage users and role assignments."
              : "Read-only view of users and assigned roles."}
          </p>
        </div>
        {canManageUsers ? (
          <Button type="button" onClick={() => setIsCreateOpen(true)}>
            New User
          </Button>
        ) : null}
      </section>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {credentialMessage ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <p>{credentialMessage}</p>
          {temporaryPassword ? (
            <div className="mt-2 flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={copyTemporaryPassword}>
                Copy Temporary Password
              </Button>
              {copiedTempPassword ? <span className="text-green-700">Copied</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-4">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email, username, or role..."
          className="md:col-span-2"
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as "name" | "role" | "status")}
        >
          <option value="name">Sort by Name</option>
          <option value="role">Sort by Role</option>
          <option value="status">Sort by Status</option>
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as "all" | "active" | "inactive")
          }
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredUsers.length === 0 ? (
          <p className="text-sm text-slate-500">No users match your current filters.</p>
        ) : (
          filteredUsers.map((user) => (
            <article key={user.user_id} className="rounded-md border border-slate-200 p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {user.display_name || `${user.first_name} ${user.last_name}`.trim() || "-"}
                  </p>
                  <p className="text-xs text-slate-500">{user.email || "-"}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                    user.is_active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {user.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <p className="text-xs text-slate-600">Username: {user.username || "-"}</p>
              <div className="mt-2">
                <p className="mb-1 text-xs font-medium text-slate-600">Role(s)</p>
                <div className="flex flex-wrap gap-1">
                  {user.roles.length === 0 ? (
                    <span className="text-xs text-slate-500">No roles assigned</span>
                  ) : (
                    [...user.roles]
                      .sort((a, b) => roleOrderScore(a.key) - roleOrderScore(b.key))
                      .map((role) => (
                      <span
                        key={`${user.user_id}-${role.id}`}
                        className="rounded-full bg-brand-50 px-2 py-1 text-[11px] text-brand-700"
                      >
                        {role.name}
                      </span>
                      ))
                  )}
                </div>
              </div>

              {canManageUsers ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 w-full"
                  onClick={() => openEditModal(user)}
                >
                  Edit User and Role
                </Button>
              ) : null}
            </article>
          ))
        )}
      </section>

      {isCreateOpen && canManageUsers ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">New User</h4>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={closeCreateModal}
              >
                Cancel
              </button>
            </div>
            <form className="space-y-3" onSubmit={createUser}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="First Name"
                  required
                  value={createForm.firstName}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                />
                <Input
                  placeholder="Last Name"
                  required
                  value={createForm.lastName}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, lastName: event.target.value }))
                  }
                />
                <Input
                  placeholder="Display Name"
                  value={createForm.displayName}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, displayName: event.target.value }))
                  }
                />
                <Input
                  placeholder="Email"
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
                <Input
                  placeholder="Username"
                  value={createForm.username}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, username: event.target.value }))
                  }
                />
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createForm.isActive}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, isActive: event.target.checked }))
                    }
                  />
                  Active
                </label>
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-600">Assign Role(s)</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {roles.map((role) => (
                    <div key={role.id} className="rounded border border-slate-200 p-2">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={createForm.roleTemplateIds.includes(role.id)}
                          onChange={() => toggleCreateRole(role.id)}
                        />
                        {role.name}
                      </label>
                      {role.description ? (
                        <p className="mt-1 text-xs text-slate-500">{role.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button disabled={creating} type="submit">
                  {creating ? "Creating..." : "Create User"}
                </Button>
                <Button type="button" variant="secondary" onClick={closeCreateModal}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingUser && canManageUsers ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">Edit User and Role</h4>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={closeEditModal}
              >
                Cancel
              </button>
            </div>
            <form className="space-y-3" onSubmit={saveUserEdits}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="First Name"
                  required
                  value={editForm.firstName}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                />
                <Input
                  placeholder="Last Name"
                  required
                  value={editForm.lastName}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, lastName: event.target.value }))
                  }
                />
                <Input
                  placeholder="Display Name"
                  value={editForm.displayName}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, displayName: event.target.value }))
                  }
                />
                <Input
                  placeholder="Email"
                  type="email"
                  required
                  value={editForm.email}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
                <Input
                  placeholder="Username"
                  value={editForm.username}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, username: event.target.value }))
                  }
                />
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editForm.isActive}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))
                    }
                  />
                  Active
                </label>
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-600">Assign Role(s)</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {roles.map((role) => (
                    <div key={role.id} className="rounded border border-slate-200 p-2">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editForm.roleTemplateIds.includes(role.id)}
                          onChange={() => toggleEditRole(role.id)}
                        />
                        {role.name}
                      </label>
                      {role.description ? (
                        <p className="mt-1 text-xs text-slate-500">{role.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {administratorRoleId !== null &&
              editingUser.roles.some((role) => role.id === administratorRoleId) &&
              !editForm.roleTemplateIds.includes(administratorRoleId) ? (
                <label className="inline-flex items-center gap-2 text-sm text-amber-700">
                  <input
                    type="checkbox"
                    checked={allowAdminRemoval}
                    onChange={(event) => setAllowAdminRemoval(event.target.checked)}
                  />
                  Confirm removal of Administrator role
                </label>
              ) : null}

              <div className="flex gap-2">
                <Button type="submit" disabled={savingUserId === editingUser.user_id}>
                  {savingUserId === editingUser.user_id ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={savingUserId === editingUser.user_id}
                  onClick={resetPasswordForUser}
                >
                  {savingUserId === editingUser.user_id ? "Working..." : "Reset Password"}
                </Button>
                <Button type="button" variant="secondary" onClick={closeEditModal}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
