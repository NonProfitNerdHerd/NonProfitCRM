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

export function TenantQuickCreate() {
  const [organizationName, setOrganizationName] = useState("");
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [primaryContactPhone, setPrimaryContactPhone] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    tenantId: string;
    slug: string;
    tenantPath: string;
    registryPath: string;
  } | null>(null);

  const suggestedSlug = useMemo(() => slugify(organizationName), [organizationName]);

  async function createTenant(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const finalSlug = toText(slug) || suggestedSlug;
    const response = await fetch("/api/platform/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationName,
        slug: finalSlug,
        primaryContactName,
        primaryContactEmail,
        primaryContactPhone,
        saveMode: "active"
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
    setResult({
      tenantId,
      slug: tenantSlug,
      tenantPath: `/platform/admin/tenants/${tenantId}`,
      registryPath: `/platform/admin/tenants`
    });
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">Quick Tenant Setup</p>
        <p className="mb-3 text-xs text-slate-600">
          Simple workflow: tenant name, contact information, create tenant, then open the new tenant
          path.
        </p>
        <form className="space-y-3" onSubmit={createTenant}>
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Tenant Name (Organization)"
              required
            />
            <Input
              value={slug || suggestedSlug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="Tenant Slug (auto-generated)"
            />
            <Input
              value={primaryContactName}
              onChange={(event) => setPrimaryContactName(event.target.value)}
              placeholder="Primary Contact Name"
            />
            <Input
              type="email"
              value={primaryContactEmail}
              onChange={(event) => setPrimaryContactEmail(event.target.value)}
              placeholder="Primary Contact Email"
            />
            <Input
              value={primaryContactPhone}
              onChange={(event) => setPrimaryContactPhone(event.target.value)}
              placeholder="Primary Contact Phone"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating Tenant..." : "Create Tenant"}
          </Button>
        </form>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {result ? (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Tenant created successfully.</p>
          <p className="mt-2 text-xs text-emerald-800">
            <span className="font-semibold">New Tenant Path:</span> {result.tenantPath}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={result.tenantPath}
              className="inline-flex rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              Open New Tenant
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
