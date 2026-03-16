"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ContactTag = {
  id: string;
  tagId: string;
  assignedAt: string;
  assignmentSource: string;
  notes: string | null;
  tag: {
    id: string;
    name: string;
    slug: string;
    path: string;
    level: number;
    color: string | null;
    isActive: boolean;
  };
};

type SearchTag = {
  id: string;
  name: string;
  slug: string;
  path: string;
  level: number;
  color: string | null;
  is_active: boolean;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function ContactTagManager({ contactId }: { contactId: string }) {
  const [assigned, setAssigned] = useState<ContactTag[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchTag[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const assignedTagIds = useMemo(() => new Set(assigned.map((tag) => tag.tag.id)), [assigned]);

  useEffect(() => {
    void loadAssigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void searchTags();
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function loadAssigned() {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/contacts/${contactId}/tags`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load contact tags.");
      setLoading(false);
      return;
    }
    setAssigned((payload?.tags ?? []) as ContactTag[]);
    setCanAssign(Boolean(payload?.canAssign));
    setLoading(false);
  }

  async function searchTags() {
    const response = await fetch(
      `/api/admin/tags/search?q=${encodeURIComponent(search)}&activeOnly=true&limit=30`
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) return;
    setResults((payload?.tags ?? []) as SearchTag[]);
  }

  async function addSelected() {
    if (selectedIds.length === 0) return;
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/contacts/${contactId}/tags`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tagIds: selectedIds,
        assignmentSource: "manual"
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to assign selected tags.");
      return;
    }
    setAssigned((payload?.tags ?? []) as ContactTag[]);
    setSelectedIds([]);
    setMessage("Tags assigned.");
  }

  async function removeTag(tagId: string) {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/contacts/${contactId}/tags`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tagIds: [tagId]
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to remove tag.");
      return;
    }
    setAssigned((payload?.tags ?? []) as ContactTag[]);
    setMessage("Tag removed.");
  }

  return (
    <section className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Tags</p>
        {loading ? <p className="text-xs text-slate-500">Loading...</p> : null}
      </div>

      {assigned.length === 0 ? (
        <p className="mb-2 text-sm text-slate-500">No tags assigned to this contact.</p>
      ) : (
        <div className="mb-2 flex flex-wrap gap-2">
          {assigned.map((assignment) => (
            <span
              key={assignment.id}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
              title={assignment.tag.path}
            >
              <span>{assignment.tag.name}</span>
              <button
                type="button"
                onClick={() => void removeTag(assignment.tag.id)}
                className="rounded px-1 text-slate-500 hover:bg-slate-200"
                aria-label={`Remove ${assignment.tag.name}`}
                disabled={!canAssign}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-md border border-slate-200 p-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tags to add"
          disabled={!canAssign}
        />
        <div className="max-h-40 overflow-auto space-y-1">
          {results.length === 0 ? (
            <p className="text-xs text-slate-500">No matching tags.</p>
          ) : (
            results.map((tag) => (
              <label key={tag.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={assignedTagIds.has(tag.id) || !canAssign}
                  checked={assignedTagIds.has(tag.id) || selectedIds.includes(tag.id)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedIds((prev) => Array.from(new Set([...prev, tag.id])));
                    } else {
                      setSelectedIds((prev) => prev.filter((id) => id !== tag.id));
                    }
                  }}
                />
                <span title={tag.path}>
                  {tag.path}
                  {assignedTagIds.has(tag.id) ? (
                    <span className="ml-2 text-xs text-slate-500">(already assigned)</span>
                  ) : null}
                </span>
              </label>
            ))
          )}
        </div>
        <Button
          type="button"
          onClick={() => void addSelected()}
          disabled={selectedIds.length === 0 || !canAssign}
        >
          Add Selected Tags
        </Button>
      </div>
      {!canAssign ? (
        <p className="mt-2 text-xs text-slate-500">
          You have view-only access for tags on this contact.
        </p>
      ) : null}

      {message ? <p className="mt-2 text-xs text-green-700">{toText(message)}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{toText(error)}</p> : null}
    </section>
  );
}

