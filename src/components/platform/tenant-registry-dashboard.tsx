"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TenantRow = Record<string, unknown>;
type TierRow = Record<string, unknown>;

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function TenantRegistryDashboard({
  initialTenants,
  backupTiers
}: {
  initialTenants: TenantRow[];
  backupTiers: TierRow[];
}) {
  const [tenants, setTenants] = useState(initialTenants);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [onboardingStage, setOnboardingStage] = useState("");
  const [backupTierId, setBackupTierId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    organizationName: "",
    slug: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    planPackage: "standard",
    enabledModulesCsv: "contacts,financial,projects,memberships,reports,import_center",
    onboardingStage: "new",
    backupTierId: toText(backupTiers.find((tier) => toText(tier.key) === "standard")?.id),
    firstTenantAdminEmail: "",
    saveMode: "draft" as "draft" | "active",
    appliedTemplate: "default_nonprofit",
    internalNotes: ""
  });

  const planOptions = useMemo(
    () => Array.from(new Set(initialTenants.map((tenant) => toText(tenant.plan_package)).filter(Boolean))),
    [initialTenants]
  );

  async function loadTenants() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (status) params.set("status", status);
    if (plan) params.set("plan", plan);
    if (onboardingStage) params.set("onboardingStage", onboardingStage);
    if (backupTierId) params.set("backupTierId", backupTierId);
    const response = await fetch(`/api/platform/tenants?${params.toString()}`);
    const payload = (await response.json().catch(() => null)) as { tenants?: TenantRow[]; message?: string } | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to load tenants.");
      setLoading(false);
      return;
    }
    setTenants(payload?.tenants ?? []);
    setLoading(false);
  }

  async function createTenant(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/platform/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createForm)
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; tenant?: TenantRow }
      | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to create tenant.");
      setLoading(false);
      return;
    }
    setMessage(
      createForm.saveMode === "active"
        ? "Tenant created and activated."
        : "Tenant provisioning draft created."
    );
    setCreateForm((prev) => ({
      ...prev,
      organizationName: "",
      slug: "",
      primaryContactName: "",
      primaryContactEmail: "",
      primaryContactPhone: "",
      firstTenantAdminEmail: "",
      internalNotes: ""
    }));
    await loadTenants();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Tenant Registry Filters</p>
          <Link
            href="/platform/admin/tenants/new"
            className="inline-flex rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Quick Create Tenant
          </Link>
        </div>
        <div className="grid gap-2 md:grid-cols-6">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search org, slug, contact..."
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={plan}
            onChange={(event) => setPlan(event.target.value)}
          >
            <option value="">All Plans</option>
            {planOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={onboardingStage}
            onChange={(event) => setOnboardingStage(event.target.value)}
          >
            <option value="">All Onboarding Stages</option>
            {["new", "discovery", "implementation", "data_migration", "training", "go_live", "active"].map(
              (option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              )
            )}
          </select>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={backupTierId}
            onChange={(event) => setBackupTierId(event.target.value)}
          >
            <option value="">All Backup Tiers</option>
            {backupTiers.map((tier) => (
              <option key={toText(tier.id)} value={toText(tier.id)}>
                {toText(tier.name)} ({toText(tier.backup_frequency)})
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={() => void loadTenants()} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </Button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-slate-900">Tenant Provisioning</p>
        <form className="space-y-3" onSubmit={createTenant}>
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              value={createForm.organizationName}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, organizationName: event.target.value }))
              }
              placeholder="Organization name"
              required
            />
            <Input
              value={createForm.slug}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, slug: event.target.value }))}
              placeholder="tenant slug"
              required
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={createForm.saveMode}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, saveMode: event.target.value as "draft" | "active" }))
              }
            >
              <option value="draft">Save Draft</option>
              <option value="active">Activate</option>
            </select>
            <Input
              value={createForm.primaryContactName}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, primaryContactName: event.target.value }))
              }
              placeholder="Primary contact name"
            />
            <Input
              type="email"
              value={createForm.primaryContactEmail}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, primaryContactEmail: event.target.value }))
              }
              placeholder="Primary contact email"
            />
            <Input
              value={createForm.primaryContactPhone}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, primaryContactPhone: event.target.value }))
              }
              placeholder="Primary contact phone"
            />
            <Input
              value={createForm.firstTenantAdminEmail}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, firstTenantAdminEmail: event.target.value }))
              }
              placeholder="First tenant admin email"
            />
            <Input
              value={createForm.enabledModulesCsv}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, enabledModulesCsv: event.target.value }))
              }
              placeholder="Modules CSV"
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={createForm.backupTierId}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, backupTierId: event.target.value }))
              }
            >
              <option value="">Select backup tier</option>
              {backupTiers.map((tier) => (
                <option key={toText(tier.id)} value={toText(tier.id)}>
                  {toText(tier.name)}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={createForm.internalNotes}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, internalNotes: event.target.value }))}
            placeholder="Internal provisioning notes"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : createForm.saveMode === "active" ? "Create & Activate" : "Save Draft"}
          </Button>
        </form>
      </section>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">Tenants ({tenants.length})</p>
          <Button type="button" variant="secondary" onClick={() => void loadTenants()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Organization</th>
                <th className="py-2">Slug</th>
                <th className="py-2">Status</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Onboarding</th>
                <th className="py-2">Backup Tier</th>
                <th className="py-2">Last Backup</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const tier = Array.isArray(tenant.tenant_backup_tiers)
                  ? tenant.tenant_backup_tiers[0]
                  : (tenant.tenant_backup_tiers as Record<string, unknown> | null);
                const backupMetadata = Array.isArray(tenant.tenant_backup_metadata)
                  ? tenant.tenant_backup_metadata[0]
                  : (tenant.tenant_backup_metadata as Record<string, unknown> | null);
                return (
                  <tr key={toText(tenant.id)} className="border-b border-slate-100">
                    <td className="py-2 font-medium text-slate-900">{toText(tenant.organization_name)}</td>
                    <td className="py-2">{toText(tenant.slug)}</td>
                    <td className="py-2">{toText(tenant.status)}</td>
                    <td className="py-2">{toText(tenant.plan_package)}</td>
                    <td className="py-2">{toText(tenant.onboarding_stage)}</td>
                    <td className="py-2">{toText(tier?.name || tier?.key) || "-"}</td>
                    <td className="py-2">
                      {toText(backupMetadata?.last_backup_at)
                        ? toText(backupMetadata?.last_backup_at).slice(0, 19).replace("T", " ")
                        : "-"}
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/platform/admin/tenants/${toText(tenant.id)}`}
                        className="text-xs font-semibold text-brand-700 hover:text-brand-900"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
