"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type OrganizationSettings = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  primary_contact_phone?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function OrganizationSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);
  const [form, setForm] = useState({
    organizationName: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    logoDataUrl: ""
  });

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/admin/organization-settings");
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; organization?: Record<string, unknown> }
      | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to load organization settings.");
      setLoading(false);
      return;
    }
    const org = (payload?.organization ?? {}) as OrganizationSettings;
    setOrganization(org);
    setForm({
      organizationName: toText(org.name),
      primaryContactName: toText(org.primary_contact_name),
      primaryContactEmail: toText(org.primary_contact_email),
      primaryContactPhone: toText(org.primary_contact_phone),
      logoDataUrl: toText(org.logo_url)
    });
    setLoading(false);
  }

  async function onLogoSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Logo file must be an image.");
      return;
    }
    if (file.size > 1024 * 1024 * 1.5) {
      setError("Logo must be smaller than 1.5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = toText(reader.result);
      setForm((prev) => ({ ...prev, logoDataUrl: result }));
      setError(null);
    };
    reader.onerror = () => {
      setError("Unable to read selected logo file.");
    };
    reader.readAsDataURL(file);
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/admin/organization-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; organization?: Record<string, unknown> }
      | null;
    if (!response.ok) {
      setError(toText(payload?.message) || "Unable to save organization settings.");
      setSaving(false);
      return;
    }
    setMessage("Organization settings updated.");
    await loadSettings();
    setSaving(false);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading organization settings...</p>;
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Tenant Identity</p>
        <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
          <div>
            <p className="text-slate-500">Tenant Name</p>
            <p className="font-medium text-slate-900">{organization?.name || "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Tenant Slug</p>
            <p className="font-medium text-slate-900">{organization?.slug || "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Organization ID</p>
            <p className="font-medium text-slate-900">{organization?.id || "-"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">
          Primary Points of Contact & Organization Branding
        </p>
        <form className="mt-3 space-y-3" onSubmit={saveSettings}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="organization-name" className="text-xs font-semibold text-slate-700">
                Tenant Name
              </label>
              <Input
                id="organization-name"
                value={form.organizationName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, organizationName: event.target.value }))
                }
                placeholder="Organization name"
                required
              />
              <p className="text-[11px] text-slate-500">
                This name appears throughout the Staff and Constituent tenant experiences.
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor="primary-contact-name" className="text-xs font-semibold text-slate-700">
                Primary Point of Contact Name
              </label>
              <Input
                id="primary-contact-name"
                value={form.primaryContactName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, primaryContactName: event.target.value }))
                }
                placeholder="Primary contact full name"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="primary-contact-email" className="text-xs font-semibold text-slate-700">
                Primary Point of Contact Email
              </label>
              <Input
                id="primary-contact-email"
                type="email"
                value={form.primaryContactEmail}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, primaryContactEmail: event.target.value }))
                }
                placeholder="primary@example.org"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="primary-contact-phone" className="text-xs font-semibold text-slate-700">
                Primary Point of Contact Phone
              </label>
              <Input
                id="primary-contact-phone"
                value={form.primaryContactPhone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, primaryContactPhone: event.target.value }))
                }
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="tenant-logo-upload" className="text-xs font-semibold text-slate-700">
              Organization Logo Upload
            </label>
            <input
              id="tenant-logo-upload"
              type="file"
              accept="image/*"
              onChange={(event) => void onLogoSelected(event.target.files?.[0] ?? null)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-slate-500">
              Upload a PNG/JPG/SVG logo (max 1.5MB). This logo appears at the top-left of the tenant
              sidebar.
            </p>
            {form.logoDataUrl ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">Logo Preview</p>
                <img
                  src={form.logoDataUrl}
                  alt="Tenant logo preview"
                  className="max-h-[80px] w-auto object-contain"
                />
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-red-700 hover:text-red-800"
                  onClick={() => setForm((prev) => ({ ...prev, logoDataUrl: "" }))}
                >
                  Remove logo
                </button>
              </div>
            ) : null}
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Organization Settings"}
          </Button>
        </form>
      </section>
    </div>
  );
}
