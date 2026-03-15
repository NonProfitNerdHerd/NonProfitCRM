"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CampaignForm } from "@/components/forms/campaign-form";

export type Campaign = {
  id: string;
  name: string;
  description: string | null;
  status: "Active" | "Inactive";
  start_date: string | null;
  end_date: string | null;
  is_child?: boolean;
  parent_campaign_id?: string | null;
  parent_campaign_name?: string | null;
};

export function CampaignsDashboard({
  initialCampaigns,
  canCreate
}: {
  initialCampaigns: Campaign[];
  canCreate: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Campaign[]>(initialCampaigns);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [collapsedByParentId, setCollapsedByParentId] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRows(initialCampaigns);
  }, [initialCampaigns]);

  async function applyFilters() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", statusFilter);
    if (search.trim()) params.set("q", search.trim());
    const response = await fetch(`/api/campaigns?${params.toString()}`);
    const payload = await response.json();
    if (response.ok) {
      setRows(payload.campaigns ?? []);
    }
    setLoading(false);
  }

  async function refreshCampaigns() {
    await applyFilters();
  }

  const summary = useMemo(() => {
    const active = rows.filter((campaign) => campaign.status === "Active").length;
    const inactive = rows.filter((campaign) => campaign.status === "Inactive").length;
    return { active, inactive };
  }, [rows]);

  const campaignTree = useMemo(() => {
    const parents = rows.filter((row) => !row.is_child);
    const children = rows.filter((row) => row.is_child);
    const childrenByParent = new Map<string, Campaign[]>();
    for (const child of children) {
      const parentId = String(child.parent_campaign_id ?? "");
      if (!parentId) continue;
      const existing = childrenByParent.get(parentId) ?? [];
      existing.push(child);
      childrenByParent.set(parentId, existing);
    }
    return parents.map((parent) => ({
      parent,
      children: childrenByParent.get(parent.id) ?? []
    }));
  }, [rows]);

  useEffect(() => {
    setCollapsedByParentId((previous) => {
      const next: Record<string, boolean> = {};
      for (const node of campaignTree) {
        next[node.parent.id] = previous[node.parent.id] ?? true;
      }
      return next;
    });
  }, [campaignTree]);

  function toggleParent(parentId: string) {
    setCollapsedByParentId((previous) => ({
      ...previous,
      [parentId]: !previous[parentId]
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Campaign Management</h3>
          <p className="text-sm text-slate-600">
            Manage active and inactive campaigns, and inspect related donations.
          </p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => setShowCreateModal(true)}>
            Create Campaign
          </Button>
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Staff Members, Executive Leaders, and Administrators can create campaigns.
          </p>
        )}
      </div>

      <div className="rounded-md border border-slate-200 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Active: {summary.active}</span>
          <span>•</span>
          <span>Inactive: {summary.inactive}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "All" | "Active" | "Inactive")
            }
          >
            <option value="All">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search campaigns..."
          />
          <Button type="button" variant="secondary" onClick={applyFilters}>
            {loading ? "Searching..." : "Apply"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {campaignTree.length === 0 ? (
          <p className="text-sm text-slate-500">No campaigns found.</p>
        ) : (
          campaignTree.map((node) => {
            const isCollapsed = collapsedByParentId[node.parent.id] ?? true;
            return (
              <div key={node.parent.id} className="rounded-md border border-slate-200">
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {node.children.length > 0 ? (
                        <button
                          type="button"
                          className="rounded px-1 text-sm text-slate-600 hover:bg-slate-100"
                          onClick={() => toggleParent(node.parent.id)}
                          aria-label={isCollapsed ? "Expand child campaigns" : "Collapse child campaigns"}
                        >
                          {isCollapsed ? "▸" : "▾"}
                        </button>
                      ) : (
                        <span className="w-4 text-center text-slate-300">•</span>
                      )}
                      <Link
                        href={`/staff/financial/campaigns/${node.parent.id}`}
                        className="text-sm font-semibold text-slate-900 hover:underline"
                      >
                        {node.parent.name}
                      </Link>
                      {node.children.length > 0 ? (
                        <span className="text-xs text-slate-500">
                          ({node.children.length} child{node.children.length === 1 ? "" : "ren"})
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{node.parent.description ?? "-"}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      node.parent.status === "Active"
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {node.parent.status}
                  </span>
                </div>

                {!isCollapsed && node.children.length > 0 ? (
                  <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-2">
                    <div className="space-y-2">
                      {node.children.map((child) => (
                        <Link
                          key={child.id}
                          href={`/staff/financial/campaigns/${node.parent.id}`}
                          className="block rounded-md border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-900">{`--${child.name}`}</p>
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${
                                child.status === "Active"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {child.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">{child.description ?? "-"}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">Create New Campaign</h4>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setShowCreateModal(false)}
              >
                Close
              </button>
            </div>
            <CampaignForm
              onCancel={() => setShowCreateModal(false)}
              onSubmitCampaign={async (values) => {
                const response = await fetch("/api/campaigns", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(values)
                });
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                  throw new Error(payload?.message ?? "Unable to create campaign.");
                }
              }}
              onSuccess={async () => {
                setShowCreateModal(false);
                await refreshCampaigns();
              }}
              submitLabel="Create Campaign"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
