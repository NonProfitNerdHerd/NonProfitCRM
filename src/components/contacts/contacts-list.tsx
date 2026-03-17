"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TagChip = {
  id: string;
  name: string;
  slug: string;
  path: string;
  level: number;
  color: string | null;
  isActive: boolean;
};

type ContactRow = Record<string, unknown> & {
  id: string;
  assigned_tags?: TagChip[];
};

type ContactMode =
  | "all"
  | "donors"
  | "contacts"
  | "donor_organizations"
  | "organizations"
  | "personal";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function ContactsList({
  title,
  subtitle,
  contacts,
  mode = "all"
}: {
  title: string;
  subtitle: string;
  contacts: Array<Record<string, unknown>>;
  mode?: ContactMode;
}) {
  const [rows, setRows] = useState<ContactRow[]>(contacts as ContactRow[]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState("");
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; path: string }>>([]);

  useEffect(() => {
    setRows(contacts as ContactRow[]);
  }, [contacts]);

  useEffect(() => {
    void loadTagOptions();
    void applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTagOptions() {
    const response = await fetch(
      `/api/admin/tags/search?activeOnly=true&limit=100`
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) return;
    const tags = (payload?.tags ?? []) as Array<{ id: string; path: string }>;
    setAvailableTags(tags);
  }

  async function applyFilters() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("mode", mode);
    params.set("limit", "200");
    if (query.trim()) params.set("q", query.trim());
    if (selectedTagId) {
      params.set("tagIds", selectedTagId);
      params.set("tagMatch", "any");
      params.set("includeDescendants", "true");
    }

    const response = await fetch(`/api/contacts?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to filter contacts.");
      setLoading(false);
      return;
    }
    setRows((payload?.contacts ?? []) as ContactRow[]);
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        <Link
          className="inline-flex rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          href="/staff/contacts/new"
        >
          New contact
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Contacts"
          className="min-w-[220px] flex-1"
        />
        <select
          className="min-w-[220px] rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={selectedTagId}
          onChange={(event) => setSelectedTagId(event.target.value)}
        >
          <option value="">All Tags</option>
          {availableTags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.path}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" onClick={() => void applyFilters()} disabled={loading}>
          {loading ? "Filtering..." : "Apply Filters"}
        </Button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Name</th>
              <th className="py-2">Organization</th>
              <th className="py-2">Email</th>
              <th className="py-2">Phone</th>
              <th className="py-2">Entity Type</th>
              <th className="py-2">Tracking Status</th>
              <th className="py-2">Tags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((contact) => {
              const contactId = toText(contact.id);
              const assigned = (contact.assigned_tags ?? []) as TagChip[];
              return (
                <tr className="border-b border-slate-100" key={contactId}>
                  <td className="py-2">
                    <Link href={`/staff/contacts/${contactId}`}>
                      {toText(contact.first_name)} {toText(contact.last_name)}
                    </Link>
                  </td>
                  <td className="py-2">{toText(contact.organization_name) || "-"}</td>
                  <td className="py-2">{toText(contact.email) || "-"}</td>
                  <td className="py-2">{toText(contact.phone) || "-"}</td>
                  <td className="py-2">{toText(contact.entity_type) || "-"}</td>
                  <td className="py-2">{toText(contact.tracking_status).replaceAll("_", "-") || "-"}</td>
                  <td className="py-2">
                    {assigned.length === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {assigned.map((tag) => (
                          <span
                            key={`${contactId}-${tag.id}`}
                            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                            title={tag.path}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No contacts found for this segment.</p>
      ) : null}
    </div>
  );
}
