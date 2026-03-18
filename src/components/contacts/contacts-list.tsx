"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagMultiSelectAutocomplete, type TagMultiSelectOption } from "@/components/tags/tag-multi-select-autocomplete";
import {
  ensureTagAutocompleteOption,
  searchTagAutocompleteOptions
} from "@/lib/tags/tag-autocomplete-client";

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function ContactsList({
  contacts,
  mode = "all",
  showMailBuilderLink = false
}: {
  contacts: Array<Record<string, unknown>>;
  mode?: ContactMode;
  showMailBuilderLink?: boolean;
}) {
  const [rows, setRows] = useState<ContactRow[]>(contacts as ContactRow[]);
  const [totalCount, setTotalCount] = useState<number>((contacts as ContactRow[]).length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<TagMultiSelectOption[]>([]);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [page, setPage] = useState(1);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(Math.max(totalCount, 0) / pageSize)), [totalCount, pageSize]);

  useEffect(() => {
    setRows(contacts as ContactRow[]);
    setTotalCount((contacts as ContactRow[]).length);
  }, [contacts]);

  useEffect(() => {
    void fetchRows(page, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, page, pageSize]);

  async function fetchRows(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("mode", mode);
    params.set("offset", String((nextPage - 1) * nextPageSize));
    params.set("limit", String(nextPageSize));
    if (query.trim()) params.set("q", query.trim());
    const selectedTagIds = selectedTags.map((tag) => toText(tag.id)).filter(isUuid);
    if (selectedTagIds.length > 0) {
      params.set("tagIds", selectedTagIds.join(","));
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
    setTotalCount(Number(payload?.totalCount ?? 0));
    setLoading(false);
  }

  async function applyFilters() {
    if (page !== 1) {
      setPage(1);
      return;
    }
    await fetchRows(1, pageSize);
  }

  return (
    <div className="space-y-3">
      <div className="mb-1 flex items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          {showMailBuilderLink ? (
            <Link
              className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href="/staff/contacts/mail-builder"
            >
              Mail Builder
            </Link>
          ) : null}
          <Link
            className="inline-flex rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            href="/staff/contacts/new"
          >
            New contact
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Contacts"
          className="min-w-[220px] flex-1"
        />
        <div className="min-w-[260px] flex-1">
          <TagMultiSelectAutocomplete
            selected={selectedTags}
            onChange={setSelectedTags}
            loadOptions={(value) =>
              searchTagAutocompleteOptions({
                query: value,
                activeOnly: true,
                limit: 20,
                module: "contacts"
              })
            }
            onCreateOption={(value) =>
              ensureTagAutocompleteOption({
                name: value,
                module: "contacts"
              })
            }
            placeholder="Filter by tags"
            emptyHint="No matching tags."
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => void applyFilters()} disabled={loading}>
          {loading ? "Filtering..." : "Apply Filters"}
        </Button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Showing {rows.length === 0 ? 0 : (page - 1) * pageSize + 1}–
          {Math.min(page * pageSize, totalCount)} of {totalCount}
        </p>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <span>Rows</span>
          <select
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={String(pageSize)}
            onChange={(event) => {
              const nextSize = Number(event.target.value);
              if (nextSize === 25 || nextSize === 50 || nextSize === 100) {
                setPageSize(nextSize);
                setPage(1);
              }
            }}
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Name</th>
              <th className="py-2">Organization</th>
              <th className="py-2">Email</th>
              <th className="py-2">Phone</th>
              <th className="py-2">City</th>
              <th className="py-2">State</th>
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
                  <td className="py-2">{toText(contact.city) || "-"}</td>
                  <td className="py-2">{toText(contact.state) || "-"}</td>
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

      <div className="mt-2 flex items-center justify-center gap-2 border-t border-slate-200 pt-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={loading || page <= 1}
        >
          Previous
        </Button>
        <span className="text-sm text-slate-600">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={loading || page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
