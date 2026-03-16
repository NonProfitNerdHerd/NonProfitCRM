"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ContactOption = {
  id: string;
  fullName: string;
  organizationName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
};

type MergePreviewContact = Record<string, unknown> & {
  id: string;
};

type MergePreview = {
  master: MergePreviewContact;
  duplicate: MergePreviewContact;
  suggestedResolution: Record<string, unknown>;
  conflicts: Array<{ field: string; master: string; duplicate: string }>;
  related: {
    master: {
      notesCount: number;
      tasksCount: number;
      donationsCount: number;
      tags: Array<{ id: string; name: string; path: string }>;
      externalIds: Array<{ sourceSystem: string; externalId: string; externalType: string | null }>;
    };
    duplicate: {
      notesCount: number;
      tasksCount: number;
      donationsCount: number;
      tags: Array<{ id: string; name: string; path: string }>;
      externalIds: Array<{ sourceSystem: string; externalId: string; externalType: string | null }>;
    };
    reassignment: {
      notes: number;
      tasks: number;
      donations: number;
      tags: number;
      externalIds: number;
    };
  };
};

type MergeHistoryItem = {
  id: string;
  master_contact_id: string;
  duplicate_contact_id: string;
  merged_at: string;
  merge_source: string;
  reassigned_counts: Record<string, unknown>;
};

const FIELD_CONFIG: Array<{ key: string; label: string; multiline?: boolean }> = [
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "preferred_name", label: "Preferred Name" },
  { key: "organization_name", label: "Organization" },
  { key: "email", label: "Primary Email" },
  { key: "alternate_email", label: "Alternate Email" },
  { key: "phone", label: "Primary Phone" },
  { key: "alternate_phone", label: "Alternate Phone" },
  { key: "mobile_number", label: "Mobile Phone" },
  { key: "address_line_1", label: "Address Line 1" },
  { key: "address_line_2", label: "Address Line 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postal_code", label: "Postal Code" },
  { key: "mailing_address_line_1", label: "Mailing Address 1" },
  { key: "mailing_address_line_2", label: "Mailing Address 2" },
  { key: "mailing_city", label: "Mailing City" },
  { key: "mailing_state", label: "Mailing State" },
  { key: "mailing_postal_code", label: "Mailing Postal Code" },
  { key: "formal_letter_name", label: "Formal Letter Name", multiline: true }
];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function displayContactLabel(contact: ContactOption) {
  const parts = [
    contact.fullName || "Unnamed Contact",
    contact.organizationName,
    contact.email,
    contact.phone
  ].filter(Boolean);
  return parts.join(" • ");
}

function formatDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export function ContactMergeDashboard({
  initialHistory,
  initialWarning
}: {
  initialHistory: MergeHistoryItem[];
  initialWarning?: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ContactOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [masterContactId, setMasterContactId] = useState("");
  const [duplicateContactId, setDuplicateContactId] = useState("");
  const [candidateList, setCandidateList] = useState<
    Array<{
      duplicateContact: ContactOption;
      score: number;
      matchReasons: string[];
    }>
  >([]);

  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [resolvedFields, setResolvedFields] = useState<Record<string, unknown>>({});
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialWarning ?? null);

  const [history, setHistory] = useState<MergeHistoryItem[]>(initialHistory);
  const [activeTab, setActiveTab] = useState<"merge" | "history">("merge");

  const selectedMaster = useMemo(
    () => searchResults.find((contact) => contact.id === masterContactId) ?? null,
    [masterContactId, searchResults]
  );
  const selectedDuplicate = useMemo(
    () => searchResults.find((contact) => contact.id === duplicateContactId) ?? null,
    [duplicateContactId, searchResults]
  );

  async function searchContacts() {
    setSearchLoading(true);
    setSearchError(null);
    const response = await fetch(
      `/api/admin/contacts/merge/candidates?q=${encodeURIComponent(searchQuery.trim())}&limit=30`
    );
    const payload = await response.json().catch(() => null);
    setSearchLoading(false);
    if (!response.ok) {
      setSearchError(payload?.message ?? "Unable to search contacts.");
      return;
    }
    setSearchResults((payload?.searchContacts ?? []) as ContactOption[]);
  }

  async function loadDuplicateCandidates() {
    if (!masterContactId) return;
    setWorking(true);
    setError(null);
    setMessage(null);
    const response = await fetch(
      `/api/admin/contacts/merge/candidates?contactId=${encodeURIComponent(masterContactId)}&limit=20`
    );
    const payload = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to find duplicate candidates.");
      return;
    }
    const candidates = (payload?.candidates ?? []) as Array<{
      duplicateContact: ContactOption;
      score: number;
      matchReasons: string[];
    }>;
    setCandidateList(candidates);
    setMessage(`Found ${candidates.length} likely duplicate candidates.`);
  }

  async function buildPreview() {
    if (!masterContactId || !duplicateContactId) return;
    setWorking(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/admin/contacts/merge/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        masterContactId,
        duplicateContactId
      })
    });
    const payload = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to build merge preview.");
      return;
    }
    const nextPreview = payload as MergePreview;
    setPreview(nextPreview);
    setResolvedFields(nextPreview.suggestedResolution ?? {});
  }

  function setResolvedValue(field: string, value: unknown) {
    setResolvedFields((prev) => ({ ...prev, [field]: value }));
  }

  async function executeMerge() {
    if (!preview) return;
    const proceed = window.confirm(
      "Confirm merge? This will mark the duplicate as merged and reassign all related records."
    );
    if (!proceed) return;

    setWorking(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/admin/contacts/merge/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        masterContactId: preview.master.id,
        duplicateContactId: preview.duplicate.id,
        resolvedFieldMap: resolvedFields,
        actionSource: "admin_merge_dashboard"
      })
    });
    const payload = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to execute merge.");
      return;
    }

    setMessage("Contact merge completed successfully.");
    setPreview(null);
    setCandidateList([]);
    setDuplicateContactId("");

    const historyResponse = await fetch("/api/admin/contacts/merge/history?limit=50");
    const historyPayload = await historyResponse.json().catch(() => null);
    if (historyResponse.ok) {
      setHistory((historyPayload?.items ?? []) as MergeHistoryItem[]);
    }
  }

  async function refreshHistory() {
    const response = await fetch("/api/admin/contacts/merge/history?limit=50");
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load merge history.");
      return;
    }
    setHistory((payload?.items ?? []) as MergeHistoryItem[]);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          className={`rounded-md px-3 py-1.5 text-sm ${activeTab === "merge" ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}
          onClick={() => setActiveTab("merge")}
          type="button"
        >
          Merge Contacts
        </button>
        <button
          className={`rounded-md px-3 py-1.5 text-sm ${activeTab === "history" ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}
          onClick={() => {
            setActiveTab("history");
            void refreshHistory();
          }}
          type="button"
        >
          Merge History
        </button>
      </div>

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      {activeTab === "history" ? (
        <div className="space-y-2">
          <div className="overflow-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Merged At</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Master ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Duplicate ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Source</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Counts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      No merge history yet.
                    </td>
                  </tr>
                ) : (
                  history.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-2">{formatDate(text(entry.merged_at))}</td>
                      <td className="px-3 py-2 font-mono text-xs">{text(entry.master_contact_id)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{text(entry.duplicate_contact_id)}</td>
                      <td className="px-3 py-2">{text(entry.merge_source) || "manual_ui"}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {JSON.stringify(entry.reassigned_counts ?? {})}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="space-y-2 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">1) Search Contacts</p>
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name, email, phone, or organization"
              />
              <Button type="button" variant="secondary" onClick={() => void searchContacts()} disabled={searchLoading}>
                {searchLoading ? "Searching..." : "Search"}
              </Button>
            </div>
            {searchError ? <p className="text-xs text-rose-600">{searchError}</p> : null}
          </section>

          <section className="space-y-2 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">2) Pick Master and Duplicate</p>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-600">
                Master Contact (survives)
                <select
                  className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                  value={masterContactId}
                  onChange={(event) => setMasterContactId(event.target.value)}
                >
                  <option value="">Select master contact</option>
                  {searchResults.map((contact) => (
                    <option key={`master-${contact.id}`} value={contact.id}>
                      {displayContactLabel(contact)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-600">
                Duplicate Contact (merged into master)
                <select
                  className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                  value={duplicateContactId}
                  onChange={(event) => setDuplicateContactId(event.target.value)}
                >
                  <option value="">Select duplicate contact</option>
                  {searchResults
                    .filter((contact) => contact.id !== masterContactId)
                    .map((contact) => (
                      <option key={`dup-${contact.id}`} value={contact.id}>
                        {displayContactLabel(contact)}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void loadDuplicateCandidates()} disabled={working || !masterContactId}>
                Find Likely Duplicates
              </Button>
              <Button
                type="button"
                onClick={() => void buildPreview()}
                disabled={working || !masterContactId || !duplicateContactId}
              >
                {working ? "Working..." : "Build Merge Preview"}
              </Button>
            </div>

            {candidateList.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                <p className="mb-1 text-xs font-semibold text-amber-800">
                  Suggested duplicates for selected master:
                </p>
                <div className="space-y-1">
                  {candidateList.map((entry) => (
                    <button
                      key={entry.duplicateContact.id}
                      type="button"
                      onClick={() => setDuplicateContactId(entry.duplicateContact.id)}
                      className={`w-full rounded border px-2 py-1 text-left text-xs ${
                        duplicateContactId === entry.duplicateContact.id
                          ? "border-brand-300 bg-white"
                          : "border-amber-200 bg-white/70 hover:bg-white"
                      }`}
                    >
                      <div className="font-medium text-slate-800">
                        {displayContactLabel(entry.duplicateContact)} (score {entry.score})
                      </div>
                      <div className="text-slate-600">{entry.matchReasons.join(" • ")}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {preview ? (
            <section className="space-y-3 rounded-md border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">3) Resolve Fields and Review Impact</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-700">Master Contact</p>
                  <p className="text-sm text-slate-800">{text(preview.master.first_name)} {text(preview.master.last_name)}</p>
                  <p className="text-xs text-slate-600">{text(preview.master.email) || "No email"}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-2">
                  <p className="text-xs font-semibold text-slate-700">Duplicate Contact</p>
                  <p className="text-sm text-slate-800">{text(preview.duplicate.first_name)} {text(preview.duplicate.last_name)}</p>
                  <p className="text-xs text-slate-600">{text(preview.duplicate.email) || "No email"}</p>
                </div>
              </div>

              {preview.conflicts.length > 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  {preview.conflicts.length} conflicting fields detected. Resolve each value below before merging.
                </p>
              ) : null}

              <div className="overflow-auto rounded-md border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold text-slate-700">Field</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-700">Master Value</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-700">Duplicate Value</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-700">Final Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {FIELD_CONFIG.map((field) => (
                      <tr key={field.key}>
                        <td className="px-2 py-2 align-top font-medium text-slate-700">{field.label}</td>
                        <td className="px-2 py-2 align-top">
                          <button
                            type="button"
                            className="text-left text-slate-700 underline-offset-2 hover:underline"
                            onClick={() => setResolvedValue(field.key, preview.master[field.key] ?? "")}
                          >
                            {text(preview.master[field.key]) || "—"}
                          </button>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <button
                            type="button"
                            className="text-left text-slate-700 underline-offset-2 hover:underline"
                            onClick={() => setResolvedValue(field.key, preview.duplicate[field.key] ?? "")}
                          >
                            {text(preview.duplicate[field.key]) || "—"}
                          </button>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <Input
                            value={text(resolvedFields[field.key])}
                            onChange={(event) => setResolvedValue(field.key, event.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="block space-y-1 text-xs text-slate-600">
                Communication Preferences (comma separated)
                <Input
                  value={
                    Array.isArray(resolvedFields.communication_preferences)
                      ? (resolvedFields.communication_preferences as unknown[]).map((entry) => text(entry)).join(", ")
                      : text(resolvedFields.communication_preferences)
                  }
                  onChange={(event) =>
                    setResolvedValue(
                      "communication_preferences",
                      event.target.value
                        .split(",")
                        .map((entry) => entry.trim())
                        .filter(Boolean)
                    )
                  }
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <details className="rounded-md border border-slate-200 p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    Related data summary
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    <li>Master notes: {preview.related.master.notesCount}</li>
                    <li>Duplicate notes (reassigned): {preview.related.duplicate.notesCount}</li>
                    <li>Master tasks: {preview.related.master.tasksCount}</li>
                    <li>Duplicate tasks (reassigned): {preview.related.duplicate.tasksCount}</li>
                    <li>Master donations: {preview.related.master.donationsCount}</li>
                    <li>Duplicate donations (reassigned): {preview.related.duplicate.donationsCount}</li>
                    <li>Duplicate tags added: {preview.related.duplicate.tags.length}</li>
                    <li>Duplicate external IDs preserved: {preview.related.duplicate.externalIds.length}</li>
                  </ul>
                </details>
                <details className="rounded-md border border-slate-200 p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    Tags and external IDs
                  </summary>
                  <div className="mt-2 space-y-2 text-xs text-slate-700">
                    <div>
                      <p className="font-semibold">Duplicate tags</p>
                      <ul className="list-disc pl-4">
                        {preview.related.duplicate.tags.length === 0 ? (
                          <li>None</li>
                        ) : (
                          preview.related.duplicate.tags.map((tag) => <li key={tag.id}>{tag.path}</li>)
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold">Duplicate external IDs</p>
                      <ul className="list-disc pl-4">
                        {preview.related.duplicate.externalIds.length === 0 ? (
                          <li>None</li>
                        ) : (
                          preview.related.duplicate.externalIds.map((item) => (
                            <li key={`${item.sourceSystem}:${item.externalId}`}>
                              {item.sourceSystem}:{item.externalId}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                </details>
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={() => void executeMerge()} disabled={working}>
                  {working ? "Merging..." : "Confirm Merge"}
                </Button>
              </div>
            </section>
          ) : null}

          {(selectedMaster || selectedDuplicate) && !preview ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              <p className="font-semibold">Selected pair</p>
              <p>Master: {selectedMaster ? displayContactLabel(selectedMaster) : "Not selected"}</p>
              <p>Duplicate: {selectedDuplicate ? displayContactLabel(selectedDuplicate) : "Not selected"}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
