"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [totalCount, setTotalCount] = useState((contacts ?? []).length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [canAssignTags, setCanAssignTags] = useState(true);

  const [query, setQuery] = useState("");
  const [tagMatch, setTagMatch] = useState<"any" | "all" | "none">("any");
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; path: string }>>([]);
  const [tagSearch, setTagSearch] = useState("");

  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"add" | "remove">("add");
  const [bulkRunning, setBulkRunning] = useState(false);

  const allVisibleIds = useMemo(() => rows.map((row) => toText(row.id)), [rows]);

  useEffect(() => {
    setRows(contacts as ContactRow[]);
    setTotalCount((contacts ?? []).length);
  }, [contacts]);

  useEffect(() => {
    void applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadTagOptions(tagSearch);
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagSearch]);

  async function loadTagOptions(searchValue = "") {
    const response = await fetch(
      `/api/admin/tags/search?q=${encodeURIComponent(searchValue)}&activeOnly=true&limit=100`
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) return;
    const tags = (payload?.tags ?? []) as Array<{ id: string; path: string }>;
    setAvailableTags(tags);
  }

  async function applyFilters() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const params = new URLSearchParams();
    params.set("mode", mode);
    params.set("limit", "200");
    if (query.trim()) params.set("q", query.trim());
    if (filterTagIds.length > 0) {
      params.set("tagIds", filterTagIds.join(","));
      params.set("tagMatch", tagMatch);
      params.set("includeDescendants", includeDescendants ? "true" : "false");
    }

    const response = await fetch(`/api/contacts?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to filter contacts.");
      setLoading(false);
      return;
    }
    setRows((payload?.contacts ?? []) as ContactRow[]);
    setTotalCount(Number(payload?.totalCount ?? (payload?.contacts ?? []).length));
    setCanAssignTags(Boolean(payload?.canAssignTags));
    setSelectedContactIds([]);
    setLoading(false);
  }

  async function runBulkAction() {
    if (selectedContactIds.length === 0 || bulkTagIds.length === 0) return;
    setBulkRunning(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/contacts/bulk-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: bulkAction,
        contactIds: selectedContactIds,
        tagIds: bulkTagIds
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to process bulk tag action.");
      setBulkRunning(false);
      return;
    }
    setMessage(
      `${bulkAction === "add" ? "Added" : "Removed"} tags for ${payload?.processedContacts ?? 0} contacts.`
    );
    setBulkRunning(false);
    setSelectedContactIds([]);
    await applyFilters();
  }

  function toggleSelection(contactId: string) {
    setSelectedContactIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  }

  function toggleIds(setter: (values: string[]) => void, selected: string[], id: string) {
    if (selected.includes(id)) setter(selected.filter((value) => value !== id));
    else setter([...selected, id]);
  }

  return (
    <div className="space-y-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href="/staff/admin/contacts/merge"
          >
            Merge contacts
          </Link>
          <Link
            className="inline-flex rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            href="/staff/contacts/new"
          >
            New contact
          </Link>
        </div>
      </div>

      {canAssignTags ? (
        <>
          <section className="space-y-2 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">Tag Filters</p>
            <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contacts"
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={tagMatch}
                onChange={(event) => setTagMatch(event.target.value as "any" | "all" | "none")}
              >
                <option value="any">Has ANY selected tags</option>
                <option value="all">Has ALL selected tags</option>
                <option value="none">Does NOT have selected tags</option>
              </select>
              <Button type="button" variant="secondary" onClick={() => void applyFilters()} disabled={loading}>
                {loading ? "Filtering..." : "Apply Filters"}
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includeDescendants}
                onChange={(event) => setIncludeDescendants(event.target.checked)}
              />
              Include descendant tags
            </label>
            <Input
              value={tagSearch}
              onChange={(event) => setTagSearch(event.target.value)}
              placeholder="Search available tags"
            />
            <div className="max-h-28 overflow-auto rounded-md border border-slate-200 p-2">
              {availableTags.length === 0 ? (
                <p className="text-xs text-slate-500">No tags available.</p>
              ) : (
                <div className="grid gap-1">
                  {availableTags.map((tag) => (
                    <label key={`filter-${tag.id}`} className="flex items-start gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={filterTagIds.includes(tag.id)}
                        onChange={() => toggleIds((values) => setFilterTagIds(values), filterTagIds, tag.id)}
                      />
                      <span title={tag.path}>{tag.path}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">Bulk Tag Actions</p>
            <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={bulkAction}
                onChange={(event) => setBulkAction(event.target.value as "add" | "remove")}
              >
                <option value="add">Add Tags</option>
                <option value="remove">Remove Tags</option>
              </select>
              <div className="max-h-24 overflow-auto rounded-md border border-slate-200 p-2">
                {availableTags.length === 0 ? (
                  <p className="text-xs text-slate-500">No tags available.</p>
                ) : (
                  <div className="grid gap-1">
                    {availableTags.map((tag) => (
                      <label key={`bulk-${tag.id}`} className="flex items-start gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={bulkTagIds.includes(tag.id)}
                          onChange={() => toggleIds((values) => setBulkTagIds(values), bulkTagIds, tag.id)}
                        />
                        <span title={tag.path}>{tag.path}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <Button
                type="button"
                onClick={() => void runBulkAction()}
                disabled={selectedContactIds.length === 0 || bulkTagIds.length === 0 || bulkRunning}
              >
                {bulkRunning ? "Running..." : "Run on Selected"}
              </Button>
            </div>
            <p className="text-xs text-slate-600">
              Selected contacts: {selectedContactIds.length} / visible: {rows.length} / total match: {totalCount}
            </p>
          </section>
        </>
      ) : (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Your role has view-only access; tag filters and bulk tag operations are not available.
        </p>
      )}

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2 pr-2">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selectedContactIds.length === rows.length}
                  onChange={(event) =>
                    setSelectedContactIds(event.target.checked ? allVisibleIds : [])
                  }
                />
              </th>
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
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={selectedContactIds.includes(contactId)}
                      onChange={() => toggleSelection(contactId)}
                    />
                  </td>
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
