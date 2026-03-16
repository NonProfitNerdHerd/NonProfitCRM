"use client";

import { useEffect, useMemo, useState } from "react";
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
  address: string | null;
};

type SuggestedGroup = {
  groupId: string;
  groupType: "email" | "phone" | "name" | "address";
  title: string;
  normalizedValue: string;
  duplicateCount: number;
  contacts: ContactOption[];
};

type MergePreviewContact = Record<string, unknown> & { id: string };

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

const FIELD_CONFIG: Array<{ key: string; label: string }> = [
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
  { key: "formal_letter_name", label: "Formal Letter Name" }
];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function displayContactLabel(contact: ContactOption) {
  return [
    contact.fullName || "Unnamed Contact",
    contact.organizationName,
    contact.email,
    contact.phone
  ]
    .filter(Boolean)
    .join(" • ");
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
  const [activeTab, setActiveTab] = useState<"merge" | "history">("merge");
  const [history, setHistory] = useState<MergeHistoryItem[]>(initialHistory);
  const [error, setError] = useState<string | null>(initialWarning ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const [groups, setGroups] = useState<SuggestedGroup[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupTypeFilter, setGroupTypeFilter] = useState<"all" | "email" | "phone" | "name" | "address">(
    "all"
  );
  const [groupQuery, setGroupQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [scannedContactCount, setScannedContactCount] = useState(0);

  const [masterContactId, setMasterContactId] = useState("");
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<string[]>([]);
  const [previewByDuplicate, setPreviewByDuplicate] = useState<Record<string, MergePreview>>({});
  const [resolvedByDuplicate, setResolvedByDuplicate] = useState<Record<string, Record<string, unknown>>>({});
  const [activePreviewDuplicateId, setActivePreviewDuplicateId] = useState("");

  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      if (groupTypeFilter !== "all" && group.groupType !== groupTypeFilter) return false;
      if (!groupQuery.trim()) return true;
      const q = groupQuery.trim().toLowerCase();
      return group.title.toLowerCase().includes(q) || group.normalizedValue.toLowerCase().includes(q);
    });
  }, [groups, groupTypeFilter, groupQuery]);

  const selectedGroup = useMemo(
    () => filteredGroups.find((group) => group.groupId === selectedGroupId) ?? null,
    [filteredGroups, selectedGroupId]
  );

  const activePreview = activePreviewDuplicateId
    ? (previewByDuplicate[activePreviewDuplicateId] ?? null)
    : null;

  async function loadSuggestedGroups() {
    setGroupLoading(true);
    setError(null);
    const response = await fetch("/api/admin/contacts/merge/candidates?mode=suggested&limit=200");
    const payload = await response.json().catch(() => null);
    setGroupLoading(false);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load suggested duplicate groups.");
      return;
    }
    const nextGroups = (payload?.groups ?? []) as SuggestedGroup[];
    setGroups(nextGroups);
    setScannedContactCount(Number(payload?.scannedContactCount ?? 0));

    if (!selectedGroupId && nextGroups.length > 0) {
      const firstGroup = nextGroups[0];
      setSelectedGroupId(firstGroup.groupId);
      setMasterContactId(firstGroup.contacts[0]?.id ?? "");
      const remaining = firstGroup.contacts.slice(1).map((contact) => contact.id);
      setSelectedDuplicateIds(remaining);
    }
  }

  useEffect(() => {
    void loadSuggestedGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedGroup) return;
    if (!selectedGroup.contacts.some((contact) => contact.id === masterContactId)) {
      setMasterContactId(selectedGroup.contacts[0]?.id ?? "");
    }
  }, [selectedGroup, masterContactId]);

  useEffect(() => {
    if (!selectedGroup || !masterContactId) return;
    const allowed = new Set(
      selectedGroup.contacts.filter((contact) => contact.id !== masterContactId).map((contact) => contact.id)
    );
    setSelectedDuplicateIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [selectedGroup, masterContactId]);

  function setGroupSelection(group: SuggestedGroup) {
    setSelectedGroupId(group.groupId);
    setMasterContactId(group.contacts[0]?.id ?? "");
    setSelectedDuplicateIds(group.contacts.slice(1).map((contact) => contact.id));
    setPreviewByDuplicate({});
    setResolvedByDuplicate({});
    setActivePreviewDuplicateId("");
    setMessage(null);
    setError(null);
  }

  function toggleDuplicate(id: string) {
    setSelectedDuplicateIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
    );
  }

  async function buildPreviewsForSelection() {
    if (!masterContactId || selectedDuplicateIds.length === 0) return;
    setWorking(true);
    setError(null);
    setMessage(null);

    const nextPreviews: Record<string, MergePreview> = {};
    const nextResolved: Record<string, Record<string, unknown>> = {};
    const failed: string[] = [];

    for (const duplicateId of selectedDuplicateIds) {
      const response = await fetch("/api/admin/contacts/merge/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ masterContactId, duplicateContactId: duplicateId })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        failed.push(duplicateId);
        continue;
      }
      const preview = payload as MergePreview;
      nextPreviews[duplicateId] = preview;
      nextResolved[duplicateId] = preview.suggestedResolution ?? {};
    }

    setPreviewByDuplicate(nextPreviews);
    setResolvedByDuplicate(nextResolved);
    const firstPreviewId = Object.keys(nextPreviews)[0] ?? "";
    setActivePreviewDuplicateId(firstPreviewId);
    setWorking(false);

    if (failed.length > 0) {
      setError(
        `Built ${Object.keys(nextPreviews).length} preview(s). ${failed.length} duplicate(s) could not be previewed.`
      );
    } else {
      setMessage(`Built ${Object.keys(nextPreviews).length} merge preview(s).`);
    }
  }

  function setResolvedValue(duplicateId: string, field: string, value: unknown) {
    setResolvedByDuplicate((prev) => ({
      ...prev,
      [duplicateId]: {
        ...(prev[duplicateId] ?? {}),
        [field]: value
      }
    }));
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

  async function executeSelectedMerges() {
    const previewEntries = Object.entries(previewByDuplicate);
    if (!masterContactId || previewEntries.length === 0) return;

    const confirmed = window.confirm(
      `Merge ${previewEntries.length} selected duplicate contact(s) into the master record?`
    );
    if (!confirmed) return;

    setWorking(true);
    setError(null);
    setMessage(null);

    let successCount = 0;
    const failed: string[] = [];
    for (const [duplicateId] of previewEntries) {
      const response = await fetch("/api/admin/contacts/merge/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          masterContactId,
          duplicateContactId: duplicateId,
          resolvedFieldMap: resolvedByDuplicate[duplicateId] ?? {},
          actionSource: "admin_merge_dashboard_batch"
        })
      });
      if (response.ok) {
        successCount += 1;
      } else {
        failed.push(duplicateId);
      }
    }

    setWorking(false);
    await Promise.all([loadSuggestedGroups(), refreshHistory()]);
    setPreviewByDuplicate({});
    setResolvedByDuplicate({});
    setActivePreviewDuplicateId("");
    setSelectedDuplicateIds([]);

    if (failed.length > 0) {
      setError(`Merged ${successCount} duplicate(s), but ${failed.length} merge(s) failed.`);
    } else {
      setMessage(`Successfully merged ${successCount} duplicate contact(s).`);
    }
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
          <section className="space-y-3 rounded-md border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                1) Suggested duplicate groups (scanned {scannedContactCount} contacts)
              </p>
              <Button type="button" variant="secondary" onClick={() => void loadSuggestedGroups()} disabled={groupLoading}>
                {groupLoading ? "Refreshing..." : "Refresh suggestions"}
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Input
                value={groupQuery}
                onChange={(event) => setGroupQuery(event.target.value)}
                placeholder="Filter suggested groups"
              />
              <select
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                value={groupTypeFilter}
                onChange={(event) =>
                  setGroupTypeFilter(
                    event.target.value as "all" | "email" | "phone" | "name" | "address"
                  )
                }
              >
                <option value="all">All match types</option>
                <option value="email">Duplicate email</option>
                <option value="phone">Duplicate phone</option>
                <option value="name">Duplicate first + last</option>
                <option value="address">Duplicate address</option>
              </select>
            </div>

            <div className="max-h-60 overflow-auto rounded-md border border-slate-200">
              {filteredGroups.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500">No duplicate groups found.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredGroups.map((group) => (
                    <button
                      key={group.groupId}
                      type="button"
                      onClick={() => setGroupSelection(group)}
                      className={`w-full px-3 py-2 text-left text-sm ${
                        selectedGroupId === group.groupId ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <p className="font-medium text-slate-800">{group.title}</p>
                      <p className="text-xs text-slate-600">
                        {group.duplicateCount} contacts • type: {group.groupType}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {selectedGroup ? (
            <section className="space-y-3 rounded-md border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">
                2) Choose master + duplicates from selected group
              </p>

              <div className="space-y-1 rounded-md border border-slate-200 p-2">
                {selectedGroup.contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-transparent px-2 py-1 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="merge-master-contact"
                        checked={masterContactId === contact.id}
                        onChange={() => setMasterContactId(contact.id)}
                      />
                      <span className="text-sm text-slate-800">{displayContactLabel(contact)}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={selectedDuplicateIds.includes(contact.id)}
                        disabled={masterContactId === contact.id}
                        onChange={() => toggleDuplicate(contact.id)}
                      />
                      Select duplicate
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void buildPreviewsForSelection()}
                  disabled={working || !masterContactId || selectedDuplicateIds.length === 0}
                >
                  {working ? "Building..." : `Build Preview (${selectedDuplicateIds.length})`}
                </Button>
              </div>
            </section>
          ) : null}

          {Object.keys(previewByDuplicate).length > 0 ? (
            <section className="space-y-3 rounded-md border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">
                3) Review multiple previews and resolve final values
              </p>

              <div className="flex flex-wrap gap-2">
                {Object.entries(previewByDuplicate).map(([duplicateId, preview]) => (
                  <button
                    key={duplicateId}
                    type="button"
                    onClick={() => setActivePreviewDuplicateId(duplicateId)}
                    className={`rounded-md border px-2 py-1 text-xs ${
                      duplicateId === activePreviewDuplicateId
                        ? "border-brand-300 bg-brand-50 text-brand-700"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {text(preview.duplicate.first_name)} {text(preview.duplicate.last_name)}
                  </button>
                ))}
              </div>

              {activePreview ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border border-slate-200 p-2">
                      <p className="text-xs font-semibold text-slate-700">Master Contact</p>
                      <p className="text-sm text-slate-800">
                        {text(activePreview.master.first_name)} {text(activePreview.master.last_name)}
                      </p>
                      <p className="text-xs text-slate-600">{text(activePreview.master.email) || "No email"}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 p-2">
                      <p className="text-xs font-semibold text-slate-700">Duplicate Contact</p>
                      <p className="text-sm text-slate-800">
                        {text(activePreview.duplicate.first_name)} {text(activePreview.duplicate.last_name)}
                      </p>
                      <p className="text-xs text-slate-600">{text(activePreview.duplicate.email) || "No email"}</p>
                    </div>
                  </div>

                  {activePreview.conflicts.length > 0 ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      {activePreview.conflicts.length} conflicting fields detected for this duplicate.
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
                                onClick={() =>
                                  setResolvedValue(
                                    activePreviewDuplicateId,
                                    field.key,
                                    activePreview.master[field.key] ?? ""
                                  )
                                }
                              >
                                {text(activePreview.master[field.key]) || "—"}
                              </button>
                            </td>
                            <td className="px-2 py-2 align-top">
                              <button
                                type="button"
                                className="text-left text-slate-700 underline-offset-2 hover:underline"
                                onClick={() =>
                                  setResolvedValue(
                                    activePreviewDuplicateId,
                                    field.key,
                                    activePreview.duplicate[field.key] ?? ""
                                  )
                                }
                              >
                                {text(activePreview.duplicate[field.key]) || "—"}
                              </button>
                            </td>
                            <td className="px-2 py-2 align-top">
                              <Input
                                value={text(
                                  resolvedByDuplicate[activePreviewDuplicateId]?.[field.key] ??
                                    activePreview.suggestedResolution?.[field.key]
                                )}
                                onChange={(event) =>
                                  setResolvedValue(activePreviewDuplicateId, field.key, event.target.value)
                                }
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
                        Array.isArray(
                          resolvedByDuplicate[activePreviewDuplicateId]?.communication_preferences ??
                            activePreview.suggestedResolution?.communication_preferences
                        )
                          ? (
                              (resolvedByDuplicate[activePreviewDuplicateId]?.communication_preferences ??
                                activePreview.suggestedResolution?.communication_preferences) as unknown[]
                            )
                              .map((entry) => text(entry))
                              .join(", ")
                          : text(
                              resolvedByDuplicate[activePreviewDuplicateId]?.communication_preferences ??
                                activePreview.suggestedResolution?.communication_preferences
                            )
                      }
                      onChange={(event) =>
                        setResolvedValue(
                          activePreviewDuplicateId,
                          "communication_preferences",
                          event.target.value
                            .split(",")
                            .map((entry) => entry.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                  </label>
                </>
              ) : null}

              <div className="flex justify-end">
                <Button type="button" onClick={() => void executeSelectedMerges()} disabled={working}>
                  {working
                    ? "Merging..."
                    : `Merge Selected Duplicates (${Object.keys(previewByDuplicate).length})`}
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
