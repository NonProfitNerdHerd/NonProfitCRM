"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RolePermission = {
  id: string;
  key: string;
  name: string;
};

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystemTemplate: boolean;
  hierarchyRank: number;
  permissions: RolePermission[];
};

const ACTION_ORDER = [
  "view",
  "create",
  "edit",
  "delete",
  "manage",
  "run",
  "build",
  "export",
  "mass",
  "other"
] as const;

function parsePermissionKey(key: string) {
  if (!key.startsWith("can_")) {
    return { action: "other", module: key };
  }
  const tokens = key.replace("can_", "").split("_").filter(Boolean);
  const [action, ...moduleTokens] = tokens;
  return {
    action: action || "other",
    module: moduleTokens.join("_") || "general"
  };
}

function toTitle(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionLabel(action: string) {
  return toTitle(action);
}

export function RolesDashboard({ roles }: { roles: RoleRow[] }) {
  const [activeTab, setActiveTab] = useState<"roles" | "table">("roles");

  const matrixRows = useMemo(() => {
    const moduleMap = new Map<
      string,
      {
        module: string;
        actionsByRole: Record<string, Set<string>>;
      }
    >();
    for (const role of roles) {
      for (const permission of role.permissions) {
        const parsed = parsePermissionKey(permission.key);
        const existing = moduleMap.get(parsed.module) ?? {
          module: parsed.module,
          actionsByRole: {}
        };
        if (!existing.actionsByRole[role.key]) {
          existing.actionsByRole[role.key] = new Set<string>();
        }
        existing.actionsByRole[role.key].add(parsed.action);
        moduleMap.set(parsed.module, existing);
      }
    }

    return Array.from(moduleMap.values()).sort((a, b) => a.module.localeCompare(b.module));
  }, [roles]);

  function downloadRolesByTableCsv() {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ["Module / Table", ...roles.map((role) => role.name)];
    const rowsForCsv = matrixRows.map((row) => {
      const roleValues = roles.map((role) => {
        const actions = Array.from(row.actionsByRole[role.key] ?? []).sort(
          (a, b) =>
            ACTION_ORDER.indexOf(a as (typeof ACTION_ORDER)[number]) -
            ACTION_ORDER.indexOf(b as (typeof ACTION_ORDER)[number])
        );
        return actions.map((action) => actionLabel(action)).join("; ");
      });
      return [toTitle(row.module), ...roleValues];
    });
    const csv = [header, ...rowsForCsv]
      .map((line) => line.map((cell) => escape(String(cell ?? ""))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "roles-by-table.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <Button
          type="button"
          variant={activeTab === "roles" ? "primary" : "secondary"}
          onClick={() => setActiveTab("roles")}
        >
          Roles
        </Button>
        <Button
          type="button"
          variant={activeTab === "table" ? "primary" : "secondary"}
          onClick={() => setActiveTab("table")}
        >
          Roles by Table
        </Button>
      </div>

      {activeTab === "roles" ? (
        <div className="space-y-4">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardHeader title={role.name} subtitle={role.description} />
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{role.isSystemTemplate ? "System template" : "Custom template"}</span>
                <span>•</span>
                <span>Hierarchy Rank: {role.hierarchyRank}</span>
              </div>
              <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Permission Summary
                </p>
                <div className="grid gap-1 text-xs text-slate-700 md:grid-cols-2">
                  {Object.entries(
                    role.permissions.reduce<Record<string, number>>((acc, permission) => {
                      const { module } = parsePermissionKey(permission.key);
                      acc[module] = (acc[module] ?? 0) + 1;
                      return acc;
                    }, {})
                  ).map(([module, count]) => (
                    <p key={`${role.id}-${module}`}>
                      {toTitle(module)}: {count} permission{count === 1 ? "" : "s"}
                    </p>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {role.permissions.map((permission) => (
                  <span
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                    key={`${role.id}-${permission.id}`}
                  >
                    {permission.key}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              Matrix view of module/table capabilities by role.
            </p>
            <Button type="button" variant="secondary" onClick={downloadRolesByTableCsv}>
              Download CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 pr-3">Module / Table</th>
                  {roles.map((role) => (
                    <th key={`header-${role.id}`} className="py-2 pr-3">
                      {role.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row) => (
                  <tr key={row.module} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium text-slate-900">{toTitle(row.module)}</td>
                    {roles.map((role) => {
                      const actions = Array.from(row.actionsByRole[role.key] ?? []).sort(
                        (a, b) =>
                          ACTION_ORDER.indexOf(a as (typeof ACTION_ORDER)[number]) -
                          ACTION_ORDER.indexOf(b as (typeof ACTION_ORDER)[number])
                      );
                      return (
                        <td key={`${row.module}-${role.id}`} className="py-2 pr-3">
                          {actions.length === 0 ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {actions.map((action) => (
                                <span
                                  key={`${row.module}-${role.id}-${action}`}
                                  className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                                >
                                  {actionLabel(action)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {matrixRows.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={roles.length + 1}>
                      No role permissions found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
