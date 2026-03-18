"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TagTypeaheadMulti,
  type TagTypeaheadOption
} from "@/components/tags/tag-typeahead-multi";
import { searchTagAutocompleteOptions } from "@/lib/tags/tag-autocomplete-client";

type TagNode = {
  id: string;
  name: string;
  slug: string;
  path: string;
  level: number;
  parent_tag_id: string | null;
  is_active: boolean;
  is_system: boolean;
  color: string | null;
  description: string | null;
  usageCount: number;
  childCount: number;
  external_key?: string | null;
  sort_order?: number;
  children?: TagNode[];
};

export type TagsDashboardNode = TagNode;

type JobRow = {
  id: string;
  job_type: "add" | "remove";
  total_contacts: number;
  processed_count: number;
  success_count: number;
  failure_count: number;
  status: string;
  created_at: string;
  completed_at: string | null;
};

type MappingRow = {
  id: string;
  internal_tag_id: string;
  external_system: string;
  external_tag_identifier: string;
  sync_direction: "inbound" | "outbound" | "bidirectional";
  mapping_status: "mapped" | "pending" | "error";
  is_active: boolean;
  last_synced_at: string | null;
  tags?: { id: string; name: string; path: string } | { id: string; name: string; path: string }[] | null;
};

const CONTACT_MODE_OPTIONS = [
  { label: "All Contacts", value: "all" },
  { label: "Donors", value: "donors" },
  { label: "Contacts (Lead/Non-Lead)", value: "contacts" },
  { label: "Donor Organizations", value: "donor_organizations" },
  { label: "Organizations", value: "organizations" },
  { label: "Personal", value: "personal" }
];

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toTagOption(tag: TagNode): TagTypeaheadOption {
  return {
    id: tag.id,
    name: toText(tag.name),
    label: toText(tag.path) || toText(tag.name)
  };
}

function collectExpandableTagIds(nodes: TagNode[]) {
  const expandableIds: string[] = [];
  const walk = (node: TagNode) => {
    const children = node.children ?? [];
    if (children.length > 0) {
      expandableIds.push(node.id);
      for (const child of children) walk(child);
    }
  };
  for (const node of nodes) walk(node);
  return expandableIds;
}

export function TagsDashboard({
  initialTree,
  initialTags,
  initialWarning,
  initialTab = "taxonomy",
  hideTabSelector = false
}: {
  initialTree: TagNode[];
  initialTags: Array<TagNode>;
  initialWarning?: string | null;
  initialTab?: "taxonomy" | "bulk" | "mappings";
  hideTabSelector?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"taxonomy" | "bulk" | "mappings">(initialTab);

  const [tags, setTags] = useState<Array<TagNode>>(initialTags);
  const [tree, setTree] = useState<Array<TagNode>>(initialTree);
  const [expandedTagIds, setExpandedTagIds] = useState<string[]>(() => collectExpandableTagIds(initialTree));
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">("active");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedUsage, setSelectedUsage] = useState<Record<string, unknown> | null>(null);
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialWarning ?? null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    parentTagId: "",
    isActive: true,
    color: "",
    sortOrder: 0,
    externalKey: ""
  });

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selectedJob, setSelectedJob] = useState<Record<string, unknown> | null>(null);
  const [selectedJobResults, setSelectedJobResults] = useState<Array<Record<string, unknown>>>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const [bulkJobType, setBulkJobType] = useState<"add" | "remove">("add");
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState("all");
  const [bulkQuery, setBulkQuery] = useState("");
  const [bulkFilterTagIds, setBulkFilterTagIds] = useState<string[]>([]);
  const [bulkFilterMatch, setBulkFilterMatch] = useState<"any" | "all" | "none">("any");
  const [bulkIncludeDescendants, setBulkIncludeDescendants] = useState(true);
  const [bulkPreview, setBulkPreview] = useState<{ totalContacts: number; sampleContactIds: string[] } | null>(
    null
  );
  const [bulkExecuting, setBulkExecuting] = useState(false);

  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [mappingForm, setMappingForm] = useState({
    id: "",
    internalTagId: "",
    externalSystem: "mailchimp",
    externalTagIdentifier: "",
    syncDirection: "outbound" as "inbound" | "outbound" | "bidirectional",
    mappingStatus: "mapped" as "mapped" | "pending" | "error",
    isActive: true
  });

  const tagById = useMemo(() => {
    const map = new Map<string, TagNode>();
    for (const tag of tags) map.set(tag.id, tag);
    return map;
  }, [tags]);

  const tagOptionById = useMemo(() => {
    const map = new Map<string, TagTypeaheadOption>();
    for (const tag of tags) {
      map.set(tag.id, toTagOption(tag));
    }
    return map;
  }, [tags]);

  const bulkTargetTagOptions = useMemo(
    () => bulkTagIds.map((id) => tagOptionById.get(id)).filter(Boolean) as TagTypeaheadOption[],
    [bulkTagIds, tagOptionById]
  );
  const bulkFilterTagOptions = useMemo(
    () => bulkFilterTagIds.map((id) => tagOptionById.get(id)).filter(Boolean) as TagTypeaheadOption[],
    [bulkFilterTagIds, tagOptionById]
  );
  const mappingTagOption = useMemo(
    () =>
      (mappingForm.internalTagId
        ? [tagOptionById.get(mappingForm.internalTagId)].filter(Boolean)
        : []) as TagTypeaheadOption[],
    [mappingForm.internalTagId, tagOptionById]
  );
  const parentTagOption = useMemo(
    () =>
      (form.parentTagId ? [tagOptionById.get(form.parentTagId)].filter(Boolean) : []) as TagTypeaheadOption[],
    [form.parentTagId, tagOptionById]
  );

  const pathPreview = useMemo(() => {
    const parentPath = form.parentTagId ? toText(tagById.get(form.parentTagId)?.path) : "";
    const name = toText(form.name);
    if (!name) return parentPath || "(enter name)";
    return parentPath ? `${parentPath} > ${name}` : name;
  }, [form.name, form.parentTagId, tagById]);

  const expandableTagIds = useMemo(() => collectExpandableTagIds(tree), [tree]);
  const expandedTagIdSet = useMemo(() => new Set(expandedTagIds), [expandedTagIds]);

  async function loadTaxonomy() {
    setLoadingTaxonomy(true);
    setError(null);
    const response = await fetch(
      `/api/admin/tags?search=${encodeURIComponent(search)}&active=${encodeURIComponent(activeFilter)}`
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load tags.");
      setLoadingTaxonomy(false);
      return;
    }
    if (payload?.schemaWarning) {
      setError(String(payload.schemaWarning));
    }
    setTags((payload?.tags ?? []) as TagNode[]);
    setTree((payload?.tree ?? []) as TagNode[]);
    setLoadingTaxonomy(false);
  }

  async function loadTagUsage(tagId: string) {
    setSelectedTagId(tagId);
    const response = await fetch(`/api/admin/tags/${tagId}/usage`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load tag usage.");
      return;
    }
    setSelectedUsage(payload as Record<string, unknown>);
  }

  useEffect(() => {
    if (activeTab !== "taxonomy") return;
    void loadTaxonomy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  useEffect(() => {
    if (activeTab !== "bulk") return;
    void loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "mappings") return;
    void loadMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    setExpandedTagIds(collectExpandableTagIds(tree));
  }, [tree]);

  async function searchContactTags(query: string, activeOnly = true) {
    return searchTagAutocompleteOptions({
      query,
      activeOnly,
      limit: 20,
      module: "contacts"
    });
  }

  async function saveTag() {
    setError(null);
    setMessage(null);
    const body = {
      name: form.name,
      slug: form.slug || undefined,
      description: form.description || undefined,
      parentTagId: form.parentTagId || null,
      isActive: form.isActive,
      color: form.color || undefined,
      sortOrder: Number(form.sortOrder || 0),
      externalKey: form.externalKey || undefined
    };
    const endpoint = editingTagId ? `/api/admin/tags/${editingTagId}` : "/api/admin/tags";
    const method = editingTagId ? "PATCH" : "POST";
    const response = await fetch(endpoint, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const issueSummary = payload?.issues
        ? JSON.stringify(payload.issues)
        : null;
      setError(payload?.message ?? issueSummary ?? "Unable to save tag.");
      return;
    }
    setEditorOpen(false);
    setEditingTagId(null);
    setForm({
      name: "",
      slug: "",
      description: "",
      parentTagId: "",
      isActive: true,
      color: "",
      sortOrder: 0,
      externalKey: ""
    });
    setMessage(editingTagId ? "Tag updated." : "Tag created.");
    await loadTaxonomy();
  }

  async function deleteTag(tagId: string) {
    if (!confirm("Hard delete this tag? This is only allowed when no dependencies exist.")) return;
    const response = await fetch(`/api/admin/tags/${tagId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to delete tag.");
      return;
    }
    setMessage("Tag deleted.");
    if (selectedTagId === tagId) {
      setSelectedTagId(null);
      setSelectedUsage(null);
    }
    await loadTaxonomy();
  }

  function startEdit(tag: TagNode) {
    setEditingTagId(tag.id);
    setForm({
      name: tag.name,
      slug: tag.slug,
      description: tag.description ?? "",
      parentTagId: tag.parent_tag_id ?? "",
      isActive: tag.is_active,
      color: tag.color ?? "",
      sortOrder: Number(tag.sort_order ?? 0),
      externalKey: tag.external_key ?? ""
    });
    setEditorOpen(true);
  }

  function startCreate() {
    setEditingTagId(null);
    setForm({
      name: "",
      slug: "",
      description: "",
      parentTagId: "",
      isActive: true,
      color: "",
      sortOrder: 0,
      externalKey: ""
    });
    setEditorOpen(true);
  }

  async function loadJobs() {
    setLoadingJobs(true);
    const response = await fetch("/api/admin/tags/jobs?limit=50");
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load jobs.");
      setLoadingJobs(false);
      return;
    }
    setJobs((payload?.jobs ?? []) as JobRow[]);
    setLoadingJobs(false);
  }

  async function loadJob(jobId: string) {
    const response = await fetch(`/api/admin/tags/jobs/${jobId}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load job details.");
      return;
    }
    setSelectedJob((payload?.job ?? null) as Record<string, unknown> | null);
    setSelectedJobResults((payload?.results ?? []) as Array<Record<string, unknown>>);
  }

  async function previewBulk() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/admin/tags/bulk/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobType: bulkJobType,
        tagIds: bulkTagIds,
        sourceFilterDefinition: {
          mode: bulkMode,
          q: bulkQuery || undefined,
          tagFilter:
            bulkFilterTagIds.length > 0
              ? {
                  tagIds: bulkFilterTagIds,
                  match: bulkFilterMatch,
                  includeDescendants: bulkIncludeDescendants
                }
              : undefined
        }
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to preview bulk job.");
      return;
    }
    setBulkPreview(payload as { totalContacts: number; sampleContactIds: string[] });
  }

  async function executeBulk() {
    setBulkExecuting(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/admin/tags/bulk/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobType: bulkJobType,
        tagIds: bulkTagIds,
        sourceFilterDefinition: {
          mode: bulkMode,
          q: bulkQuery || undefined,
          tagFilter:
            bulkFilterTagIds.length > 0
              ? {
                  tagIds: bulkFilterTagIds,
                  match: bulkFilterMatch,
                  includeDescendants: bulkIncludeDescendants
                }
              : undefined
        }
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to execute bulk job.");
      setBulkExecuting(false);
      return;
    }
    setBulkExecuting(false);
    setMessage(`Bulk job ${payload?.jobId} completed.`);
    await loadJobs();
    if (payload?.jobId) {
      await loadJob(String(payload.jobId));
    }
  }

  async function loadMappings() {
    const response = await fetch("/api/admin/tags/mappings");
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load mappings.");
      return;
    }
    setMappings((payload?.mappings ?? []) as MappingRow[]);
  }

  async function saveMapping() {
    const response = await fetch("/api/admin/tags/mappings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: mappingForm.id || undefined,
        internalTagId: mappingForm.internalTagId,
        externalSystem: mappingForm.externalSystem,
        externalTagIdentifier: mappingForm.externalTagIdentifier,
        syncDirection: mappingForm.syncDirection,
        mappingStatus: mappingForm.mappingStatus,
        isActive: mappingForm.isActive
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to save mapping.");
      return;
    }
    setMessage("Mapping saved.");
    setMappingForm({
      id: "",
      internalTagId: "",
      externalSystem: "mailchimp",
      externalTagIdentifier: "",
      syncDirection: "outbound",
      mappingStatus: "mapped",
      isActive: true
    });
    await loadMappings();
  }

  async function removeMapping(mappingId: string) {
    const response = await fetch("/api/admin/tags/mappings", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: mappingId })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to delete mapping.");
      return;
    }
    setMessage("Mapping deleted.");
    await loadMappings();
  }

  return (
    <div className="space-y-4">
      {!hideTabSelector ? (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          <Button
            type="button"
            variant={activeTab === "taxonomy" ? "primary" : "secondary"}
            onClick={() => setActiveTab("taxonomy")}
          >
            Taxonomy
          </Button>
          <Button
            type="button"
            variant={activeTab === "bulk" ? "primary" : "secondary"}
            onClick={() => setActiveTab("bulk")}
          >
            Bulk Jobs
          </Button>
          <Button
            type="button"
            variant={activeTab === "mappings" ? "primary" : "secondary"}
            onClick={() => setActiveTab("mappings")}
          >
            Integration Mappings
          </Button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {activeTab === "taxonomy" ? (
        <section className="space-y-3">
          <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, slug, or path"
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value as "active" | "inactive" | "all")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
            <Button type="button" variant="secondary" onClick={() => void loadTaxonomy()}>
              Search
            </Button>
            <Button type="button" onClick={startCreate}>
              New Tag
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Hierarchy</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setExpandedTagIds(expandableTagIds)}
                    disabled={expandableTagIds.length === 0}
                  >
                    Expand All
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setExpandedTagIds([])}
                    disabled={expandableTagIds.length === 0}
                  >
                    Collapse All
                  </Button>
                </div>
              </div>
              {loadingTaxonomy ? (
                <p className="text-sm text-slate-500">Loading tags...</p>
              ) : tree.length === 0 ? (
                <p className="text-sm text-slate-500">No tags found.</p>
              ) : (
                <div className="space-y-1">{tree.map((node) => renderTagNode(node, 0))}</div>
              )}
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Usage</p>
              {!selectedTagId || !selectedUsage ? (
                <p className="text-sm text-slate-500">Select a tag to inspect usage and mappings.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-medium text-slate-700">Tag:</span>{" "}
                    {toText((selectedUsage.tag as Record<string, unknown> | null)?.path)}
                  </p>
                  <p>
                    <span className="font-medium text-slate-700">Direct assignments:</span>{" "}
                    {toText(selectedUsage.directAssignedContacts)}
                  </p>
                  <p>
                    <span className="font-medium text-slate-700">Rollup assignments:</span>{" "}
                    {toText(selectedUsage.rollupAssignedContacts)}
                  </p>
                  <p>
                    <span className="font-medium text-slate-700">Child tags:</span>{" "}
                    {Array.isArray(selectedUsage.childTags) ? selectedUsage.childTags.length : 0}
                  </p>
                  <p>
                    <span className="font-medium text-slate-700">Integration mappings:</span>{" "}
                    {Array.isArray(selectedUsage.mappings) ? selectedUsage.mappings.length : 0}
                  </p>
                  {Array.isArray(selectedUsage.childTags) && selectedUsage.childTags.length > 0 ? (
                    <div>
                      <p className="font-medium text-slate-700">Child Tags</p>
                      <ul className="list-inside list-disc text-xs text-slate-600">
                        {(selectedUsage.childTags as Array<Record<string, unknown>>).map((child) => (
                          <li key={toText(child.id)}>{toText(child.path) || toText(child.name)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {Array.isArray(selectedUsage.mappings) && selectedUsage.mappings.length > 0 ? (
                    <div>
                      <p className="font-medium text-slate-700">Mappings</p>
                      <ul className="list-inside list-disc text-xs text-slate-600">
                        {(selectedUsage.mappings as Array<Record<string, unknown>>).map((mapping) => (
                          <li key={toText(mapping.id)}>
                            {toText(mapping.external_system)}: {toText(mapping.external_tag_identifier)} (
                            {toText(mapping.sync_direction)})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "bulk" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-900">Bulk Tagging Workflow</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Action</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={bulkJobType}
                onChange={(event) => setBulkJobType(event.target.value as "add" | "remove")}
              >
                <option value="add">Add tags</option>
                <option value="remove">Remove tags</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Source Mode</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={bulkMode}
                onChange={(event) => setBulkMode(event.target.value)}
              >
                {CONTACT_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Contact search</label>
              <Input
                value={bulkQuery}
                onChange={(event) => setBulkQuery(event.target.value)}
                placeholder="Optional search"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Filter by existing tags</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={bulkFilterMatch}
                onChange={(event) => setBulkFilterMatch(event.target.value as "any" | "all" | "none")}
              >
                <option value="any">Has ANY selected tags</option>
                <option value="all">Has ALL selected tags</option>
                <option value="none">Does NOT have selected tags</option>
              </select>
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={bulkIncludeDescendants}
                  onChange={(event) => setBulkIncludeDescendants(event.target.checked)}
                />
                Include descendant tags in filter
              </label>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Target tags (for action)
              </p>
              <TagTypeaheadMulti
                selected={bulkTargetTagOptions}
                loadOptions={(query) => searchContactTags(query, true)}
                onChange={(next) => setBulkTagIds(next.map((entry) => entry.id))}
                placeholder="Search and select tags..."
              />
            </div>
            <div className="rounded-md border border-slate-200 p-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Existing tag filter
              </p>
              <TagTypeaheadMulti
                selected={bulkFilterTagOptions}
                loadOptions={(query) => searchContactTags(query, true)}
                onChange={(next) => setBulkFilterTagIds(next.map((entry) => entry.id))}
                placeholder="Search existing tags filter..."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void previewBulk()}>
              Preview
            </Button>
            <Button
              type="button"
              onClick={() => void executeBulk()}
              disabled={bulkTagIds.length === 0 || bulkExecuting}
            >
              {bulkExecuting ? "Running..." : "Execute"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void loadJobs()}>
              Refresh Jobs
            </Button>
          </div>

          {bulkPreview ? (
            <p className="text-sm text-slate-700">
              Preview found <span className="font-semibold">{bulkPreview.totalContacts}</span>{" "}
              contacts.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Processed</th>
                  <th className="py-2 pr-3">Success</th>
                  <th className="py-2 pr-3">Failure</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {loadingJobs ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={8}>
                      Loading jobs...
                    </td>
                  </tr>
                ) : jobs.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={8}>
                      No jobs yet.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{new Date(job.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-3">{job.job_type}</td>
                      <td className="py-2 pr-3">{job.status}</td>
                      <td className="py-2 pr-3">{job.total_contacts}</td>
                      <td className="py-2 pr-3">{job.processed_count}</td>
                      <td className="py-2 pr-3">{job.success_count}</td>
                      <td className="py-2 pr-3">{job.failure_count}</td>
                      <td className="py-2 pr-3">
                        <Button type="button" variant="secondary" onClick={() => void loadJob(job.id)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {selectedJob ? (
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">
                Job Detail: {toText(selectedJob.id)}
              </p>
              <p className="mb-2 text-xs text-slate-600">
                Status: {toText(selectedJob.status)} • Processed: {toText(selectedJob.processed_count)} /
                {toText(selectedJob.total_contacts)}
              </p>
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="py-1 pr-2">Created</th>
                      <th className="py-1 pr-2">Contact</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1 pr-2">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedJobResults.map((row) => (
                      <tr key={toText(row.id)} className="border-b border-slate-100">
                        <td className="py-1 pr-2">{toText(row.created_at)}</td>
                        <td className="py-1 pr-2">{toText(row.contact_id)}</td>
                        <td className="py-1 pr-2">{toText(row.status)}</td>
                        <td className="py-1 pr-2">{toText(row.message)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "mappings" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-900">External Tag Mappings</p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Internal Tag</label>
              <TagTypeaheadMulti
                selected={mappingTagOption}
                loadOptions={(query) => searchContactTags(query, false)}
                onChange={(next) =>
                  setMappingForm((prev) => ({
                    ...prev,
                    internalTagId: next[0]?.id ?? ""
                  }))
                }
                maxSelections={1}
                placeholder="Search internal tag..."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">External System</label>
              <Input
                value={mappingForm.externalSystem}
                onChange={(event) =>
                  setMappingForm((prev) => ({ ...prev, externalSystem: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">External Identifier</label>
              <Input
                value={mappingForm.externalTagIdentifier}
                onChange={(event) =>
                  setMappingForm((prev) => ({
                    ...prev,
                    externalTagIdentifier: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Sync Direction</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={mappingForm.syncDirection}
                onChange={(event) =>
                  setMappingForm((prev) => ({
                    ...prev,
                    syncDirection: event.target.value as "inbound" | "outbound" | "bidirectional"
                  }))
                }
              >
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
                <option value="bidirectional">Bidirectional</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={mappingForm.mappingStatus}
                onChange={(event) =>
                  setMappingForm((prev) => ({
                    ...prev,
                    mappingStatus: event.target.value as "mapped" | "pending" | "error"
                  }))
                }
              >
                <option value="mapped">Mapped</option>
                <option value="pending">Pending</option>
                <option value="error">Error</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={mappingForm.isActive}
                  onChange={(event) =>
                    setMappingForm((prev) => ({ ...prev, isActive: event.target.checked }))
                  }
                />
                Active
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={() => void saveMapping()}>
              Save Mapping
            </Button>
            <Button type="button" variant="secondary" onClick={() => void loadMappings()}>
              Refresh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 pr-3">Tag</th>
                  <th className="py-2 pr-3">System</th>
                  <th className="py-2 pr-3">External Identifier</th>
                  <th className="py-2 pr-3">Direction</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Active</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {mappings.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={7}>
                      No mappings configured.
                    </td>
                  </tr>
                ) : (
                  mappings.map((mapping) => {
                    const tagValue = Array.isArray(mapping.tags) ? mapping.tags[0] : mapping.tags;
                    return (
                      <tr key={mapping.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3">{toText(tagValue?.path)}</td>
                        <td className="py-2 pr-3">{mapping.external_system}</td>
                        <td className="py-2 pr-3">{mapping.external_tag_identifier}</td>
                        <td className="py-2 pr-3">{mapping.sync_direction}</td>
                        <td className="py-2 pr-3">{mapping.mapping_status}</td>
                        <td className="py-2 pr-3">{mapping.is_active ? "Yes" : "No"}</td>
                        <td className="py-2 pr-3">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                setMappingForm({
                                  id: mapping.id,
                                  internalTagId: mapping.internal_tag_id,
                                  externalSystem: mapping.external_system,
                                  externalTagIdentifier: mapping.external_tag_identifier,
                                  syncDirection: mapping.sync_direction,
                                  mappingStatus: mapping.mapping_status,
                                  isActive: mapping.is_active
                                })
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              onClick={() => void removeMapping(mapping.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editingTagId ? "Edit Tag" : "Create Tag"}
              </h3>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setEditorOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Slug</label>
                <Input
                  value={form.slug}
                  onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Parent</label>
                <TagTypeaheadMulti
                  selected={parentTagOption}
                  loadOptions={async (query) => {
                    const results = await searchContactTags(query, false);
                    return results.filter((entry) => entry.id !== editingTagId);
                  }}
                  onChange={(next) =>
                    setForm((prev) => ({
                      ...prev,
                      parentTagId: next[0]?.id ?? ""
                    }))
                  }
                  maxSelections={1}
                  placeholder="Search parent tag or leave blank for top-level"
                />
                {form.parentTagId ? (
                  <button
                    type="button"
                    className="mt-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
                    onClick={() => setForm((prev) => ({ ...prev, parentTagId: "" }))}
                  >
                    Clear parent (Top-level)
                  </button>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Sort Order</label>
                <Input
                  type="number"
                  value={String(form.sortOrder)}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, sortOrder: Number(event.target.value || 0) }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Color</label>
                <Input
                  value={form.color}
                  onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                  placeholder="#3b82f6"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">External Key</label>
                <Input
                  value={form.externalKey}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, externalKey: event.target.value }))
                  }
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                <textarea
                  className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </div>
              <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <p className="font-semibold text-slate-600">Path Preview</p>
                <p>{pathPreview}</p>
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                    }
                  />
                  Active
                </label>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="button" onClick={() => void saveTag()}>
                Save
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  function renderTagNode(node: TagNode, depth: number) {
    const childNodes = node.children ?? [];
    const hasChildren = childNodes.length > 0;
    const isExpanded = !hasChildren || expandedTagIdSet.has(node.id);
    return (
      <div key={node.id} className="space-y-1">
        <div
          className={`rounded-md border px-2 py-2 ${selectedTagId === node.id ? "border-brand-300 bg-brand-50" : "border-slate-200"}`}
          style={{ marginLeft: `${depth * 16}px` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-xs text-slate-700 disabled:cursor-default disabled:opacity-40"
                aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
                title={isExpanded ? "Collapse" : "Expand"}
                disabled={!hasChildren}
                onClick={() =>
                  setExpandedTagIds((prev) =>
                    prev.includes(node.id) ? prev.filter((entry) => entry !== node.id) : [...prev, node.id]
                  )
                }
              >
                {hasChildren ? (isExpanded ? "-" : "+") : " "}
              </button>
              <button
                type="button"
                className="text-left text-sm"
                onClick={() => void loadTagUsage(node.id)}
                title={node.path}
              >
                <span className="font-medium text-slate-900">{node.name}</span>
                <span className="ml-2 text-xs text-slate-500">({node.path})</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                Usage {node.usageCount}
              </span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                Children {node.childCount}
              </span>
              {!node.is_active ? (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Inactive</span>
              ) : null}
              <Button type="button" variant="secondary" onClick={() => startEdit(node)}>
                Edit
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void updateTagDefinitionInline(node.id, {
                    isActive: !node.is_active
                  })
                }
              >
                {node.is_active ? "Deactivate" : "Activate"}
              </Button>
              <Button type="button" variant="danger" onClick={() => void deleteTag(node.id)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
        {hasChildren && isExpanded ? childNodes.map((child) => renderTagNode(child, depth + 1)) : null}
      </div>
    );
  }

  async function updateTagDefinitionInline(tagId: string, update: { isActive?: boolean }) {
    const response = await fetch(`/api/admin/tags/${tagId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to update tag.");
      return;
    }
    setMessage("Tag updated.");
    await loadTaxonomy();
    if (selectedTagId === tagId) {
      await loadTagUsage(tagId);
    }
  }
}

