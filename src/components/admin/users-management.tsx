"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RoleTemplate = {
  id: string;
  key: string;
  name: string;
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

export function UsersManagement({
  initialUsers,
  roles
}: {
  initialUsers: UserRow[];
  roles: RoleTemplate[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    username: "",
    isActive: true,
    roleTemplateIds: [] as string[]
  });

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createForm)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Failed to create user.");
      setCreating(false);
      return;
    }

    const refreshed = await fetch("/api/admin/users");
    const refreshedPayload = await refreshed.json().catch(() => null);
    if (refreshed.ok) {
      setUsers(refreshedPayload?.users ?? []);
    }

    setCreateForm({
      firstName: "",
      lastName: "",
      displayName: "",
      email: "",
      username: "",
      isActive: true,
      roleTemplateIds: []
    });
    setMessage("User created successfully.");
    setCreating(false);
  }

  async function saveRow(user: UserRow) {
    setSavingUserId(user.user_id);
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/admin/users/${user.user_id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: user.first_name,
        lastName: user.last_name,
        displayName: user.display_name,
        email: user.email,
        username: user.username || undefined,
        isActive: user.is_active,
        roleTemplateIds: user.roles.map((role) => role.id)
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Failed to update user.");
      setSavingUserId(null);
      return;
    }

    setMessage("User updated.");
    setSavingUserId(null);
  }

  function toggleCreateRole(roleId: string) {
    setCreateForm((prev) => ({
      ...prev,
      roleTemplateIds: prev.roleTemplateIds.includes(roleId)
        ? prev.roleTemplateIds.filter((id) => id !== roleId)
        : [...prev.roleTemplateIds, roleId]
    }));
  }

  function toggleRowRole(userId: string, role: RoleTemplate) {
    setUsers((prev) =>
      prev.map((row) => {
        if (row.user_id !== userId) return row;
        const exists = row.roles.some((currentRole) => currentRole.id === role.id);
        return {
          ...row,
          roles: exists
            ? row.roles.filter((currentRole) => currentRole.id !== role.id)
            : [...row.roles, { id: role.id, key: role.key, name: role.name }]
        };
      })
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 p-4">
        <p className="mb-2 text-sm font-semibold">Create User</p>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={createUser}>
          <Input
            placeholder="First Name"
            value={createForm.firstName}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, firstName: event.target.value }))}
          />
          <Input
            placeholder="Last Name"
            value={createForm.lastName}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, lastName: event.target.value }))}
          />
          <Input
            placeholder="Display Name"
            value={createForm.displayName}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, displayName: event.target.value }))}
          />
          <Input
            placeholder="Email"
            value={createForm.email}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <Input
            placeholder="Username"
            value={createForm.username}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, username: event.target.value }))}
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
          <div className="md:col-span-3">
            <p className="mb-1 text-xs text-slate-600">Assign Role(s)</p>
            <div className="grid gap-2 md:grid-cols-3">
              {roles.map((role) => (
                <label key={role.id} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createForm.roleTemplateIds.includes(role.id)}
                    onChange={() => toggleCreateRole(role.id)}
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </div>
          <Button disabled={creating} type="submit">
            {creating ? "Creating..." : "Create User"}
          </Button>
        </form>
      </section>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Username</th>
              <th className="py-2">Active</th>
              <th className="py-2">Roles</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id} className="border-b border-slate-100 align-top">
                <td className="py-2">
                  <div className="grid gap-1">
                    <Input
                      value={user.first_name}
                      onChange={(event) =>
                        setUsers((prev) =>
                          prev.map((row) =>
                            row.user_id === user.user_id
                              ? { ...row, first_name: event.target.value }
                              : row
                          )
                        )
                      }
                      placeholder="First"
                    />
                    <Input
                      value={user.last_name}
                      onChange={(event) =>
                        setUsers((prev) =>
                          prev.map((row) =>
                            row.user_id === user.user_id
                              ? { ...row, last_name: event.target.value }
                              : row
                          )
                        )
                      }
                      placeholder="Last"
                    />
                    <Input
                      value={user.display_name}
                      onChange={(event) =>
                        setUsers((prev) =>
                          prev.map((row) =>
                            row.user_id === user.user_id
                              ? { ...row, display_name: event.target.value }
                              : row
                          )
                        )
                      }
                      placeholder="Display"
                    />
                  </div>
                </td>
                <td className="py-2">
                  <Input
                    value={user.email}
                    onChange={(event) =>
                      setUsers((prev) =>
                        prev.map((row) =>
                          row.user_id === user.user_id ? { ...row, email: event.target.value } : row
                        )
                      )
                    }
                  />
                </td>
                <td className="py-2">
                  <Input
                    value={user.username}
                    onChange={(event) =>
                      setUsers((prev) =>
                        prev.map((row) =>
                          row.user_id === user.user_id
                            ? { ...row, username: event.target.value }
                            : row
                        )
                      )
                    }
                  />
                </td>
                <td className="py-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={user.is_active}
                      onChange={(event) =>
                        setUsers((prev) =>
                          prev.map((row) =>
                            row.user_id === user.user_id
                              ? { ...row, is_active: event.target.checked }
                              : row
                          )
                        )
                      }
                    />
                    {user.is_active ? "Active" : "Inactive"}
                  </label>
                </td>
                <td className="py-2">
                  <div className="grid gap-1">
                    {roles.map((role) => (
                      <label key={`${user.user_id}-${role.id}`} className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={user.roles.some((rowRole) => rowRole.id === role.id)}
                          onChange={() => toggleRowRole(user.user_id, role)}
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="py-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={savingUserId === user.user_id}
                    onClick={() => saveRow(user)}
                  >
                    {savingUserId === user.user_id ? "Saving..." : "Save"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
