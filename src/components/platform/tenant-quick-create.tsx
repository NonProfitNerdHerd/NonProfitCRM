"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "tenant";
}

type TierRow = Record<string, unknown>;

export function TenantQuickCreate({ backupTiers }: { backupTiers: TierRow[] }) {
  const [createForm, setCreateForm] = useState({
    organizationName: "",
    slug: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    planPackage: "standard",
    enabledModulesCsv: "contacts,financial,projects,memberships,reports,import_center,volunteer_coordination",
    onboardingStage: "new",
    backupTierId: toText(backupTiers.find((tier) => toText(tier.key) === "standard")?.id),
    firstTenantAdminEmail: "",
    saveMode: "active" as "draft" | "active",
    appliedTemplate: "default_nonprofit",
    internalNotes: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{
    tenantId: string;
    slug: string;
    detailPath: string;
    tenantPath: string;
    registryPath: string;
  } | null>(null);

  const suggestedSlug = useMemo(() => slugify(createForm.organizationName), [createForm.organizationName]);

  async function createTenant(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setResult(null);

    const finalSlug = toText(createForm.slug) || suggestedSlug;
    const response = await fetch("/api/platform/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationName: createForm.organizationName,
        slug: finalSlug,
        primaryContactName: createForm.primaryContactName,
        primaryContactEmail: createForm.primaryContactEmail,
        primaryContactPhone: createForm.primaryContactPhone,
        planPackage: createForm.planPackage,
        enabledModulesCsv: createForm.enabledModulesCsv,
        onboardingStage: createForm.onboardingStage,
        backupTierId: createForm.backupTierId || null,
        firstTenantAdminEmail: createForm.firstTenantAdminEmail,
        saveMode: createForm.saveMode,
        appliedTemplate: createForm.appliedTemplate,
        internalNotes: createForm.internalNotes
      })
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          message?: string;
          tenant?: Record<string, unknown>;
        }
      | null;

    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to create tenant.");
      setLoading(false);
      return;
    }

    const tenantId = toText(payload?.tenant?.id);
    const tenantSlug = toText(payload?.tenant?.slug) || finalSlug;
    setMessage(
      createForm.saveMode === "active"
        ? "Tenant created and activated."
        : "Tenant provisioning draft created."
    );
    setResult({
      tenantId,
      slug: tenantSlug,
      detailPath: `/platform/admin/tenants/${tenantId}`,
      tenantPath: `/platform/admin/tenants/${tenantId}/open`,
      registryPath: `/platform/admin/tenants`
    });
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
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">Tenant Provisioning</p>
        <p className="mb-3 text-xs text-slate-600">
          Provision a tenant with contact details, module configuration, backup tier, and activation mode.
        </p>
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
              value={createForm.slug || suggestedSlug}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, slug: event.target.value }))}
              placeholder="Tenant slug (auto-generated)"
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
              <option value="active">Create & Activate</option>
            </select>
            <Input
              value={createForm.primaryContactName}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, primaryContactName: event.target.value }))
              }
              placeholder="Primary Contact Name"
            />
            <Input
              type="email"
              value={createForm.primaryContactEmail}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, primaryContactEmail: event.target.value }))
              }
              placeholder="Primary Contact Email"
            />
            <Input
              value={createForm.primaryContactPhone}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, primaryContactPhone: event.target.value }))
              }
              placeholder="Primary Contact Phone"
            />
            <Input
              value={createForm.firstTenantAdminEmail}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, firstTenantAdminEmail: event.target.value }))
              }
              placeholder="First tenant admin email"
            />
            <Input
              value={createForm.planPackage}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, planPackage: event.target.value }))}
              placeholder="Plan package"
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={createForm.onboardingStage}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, onboardingStage: event.target.value }))
              }
            >
              {["new", "discovery", "implementation", "data_migration", "training", "go_live", "active"].map(
                (stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                )
              )}
            </select>
            <Input
              value={createForm.enabledModulesCsv}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, enabledModulesCsv: event.target.value }))
              }
              placeholder="Enabled modules CSV"
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={createForm.backupTierId}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, backupTierId: event.target.value }))}
            >
              <option value="">Select backup tier</option>
              {backupTiers.map((tier) => (
                <option key={toText(tier.id)} value={toText(tier.id)}>
                  {toText(tier.name)} ({toText(tier.backup_frequency)})
                </option>
              ))}
            </select>
            <Input
              value={createForm.appliedTemplate}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, appliedTemplate: event.target.value }))}
              placeholder="Applied template key"
            />
          </div>
          <textarea
            className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={createForm.internalNotes}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, internalNotes: event.target.value }))}
            placeholder="Internal provisioning notes"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Creating Tenant..." : createForm.saveMode === "active" ? "Create & Activate" : "Save Draft"}
          </Button>
        </form>
      </section>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {result ? (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Tenant provisioned successfully.</p>
          <p className="mt-2 text-xs text-emerald-800">
            <span className="font-semibold">Tenant detail path:</span> {result.detailPath}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={result.tenantPath}
              className="inline-flex rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              Open Tenant Console
            </Link>
            <Link
              href={result.detailPath}
              className="inline-flex rounded-md border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Open Tenant Detail
            </Link>
            <Link
              href={result.registryPath}
              className="inline-flex rounded-md border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Back to Tenant Registry
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
