"use client";

import { useEffect, useMemo, useState } from "react";
import { TagMultiSelectAutocomplete, type TagMultiSelectOption } from "@/components/tags/tag-multi-select-autocomplete";
import {
  ensureTagAutocompleteOption,
  searchTagAutocompleteOptions
} from "@/lib/tags/tag-autocomplete-client";

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

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function ContactTagManager({ contactId }: { contactId: string }) {
  const [assigned, setAssigned] = useState<ContactTag[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const assignedTagIds = useMemo(() => new Set(assigned.map((tag) => tag.tag.id)), [assigned]);
  const selectedTagOptions = useMemo<TagMultiSelectOption[]>(
    () =>
      assigned.map((entry) => ({
        id: entry.tag.id,
        name: entry.tag.name,
        label: entry.tag.path || entry.tag.name
      })),
    [assigned]
  );

  useEffect(() => {
    void loadAssigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

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

  async function syncTags(next: TagMultiSelectOption[]) {
    if (!canAssign) return;
    const nextIds = new Set(next.map((entry) => entry.id));
    const toAdd = Array.from(nextIds).filter((id) => !assignedTagIds.has(id));
    const toRemove = Array.from(assignedTagIds).filter((id) => !nextIds.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) return;

    setError(null);
    setMessage(null);
    setSyncing(true);
    try {
      if (toAdd.length > 0) {
        const addResponse = await fetch(`/api/contacts/${contactId}/tags`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tagIds: toAdd,
            assignmentSource: "manual"
          })
        });
        const addPayload = await addResponse.json().catch(() => null);
        if (!addResponse.ok) {
          throw new Error(addPayload?.message ?? "Unable to assign selected tags.");
        }
      }
      if (toRemove.length > 0) {
        const removeResponse = await fetch(`/api/contacts/${contactId}/tags`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tagIds: toRemove
          })
        });
        const removePayload = await removeResponse.json().catch(() => null);
        if (!removeResponse.ok) {
          throw new Error(removePayload?.message ?? "Unable to remove tag.");
        }
      }
      await loadAssigned();
      setMessage("Tags updated.");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to update tags.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Tags</p>
        {loading || syncing ? (
          <p className="text-xs text-slate-500">{loading ? "Loading..." : "Saving..."}</p>
        ) : null}
      </div>
      <TagMultiSelectAutocomplete
        selected={selectedTagOptions}
        onChange={(next) => void syncTags(next)}
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
        placeholder="Search and add tags"
        disabled={!canAssign || syncing || loading}
      />
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

