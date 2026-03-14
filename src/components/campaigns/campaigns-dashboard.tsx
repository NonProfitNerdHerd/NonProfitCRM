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
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No campaigns found.</p>
        ) : (
          rows.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/staff/campaigns/${campaign.id}`}
              className="block rounded-md border border-slate-200 px-4 py-3 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{campaign.name}</p>
                <span
                  className={`rounded-full px-2 py-1 text-xs ${
                    campaign.status === "Active"
                      ? "bg-green-100 text-green-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {campaign.status}
                </span>
              </div>
              <p className="text-xs text-slate-600">{campaign.description ?? "-"}</p>
            </Link>
          ))
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
              onSuccess={async () => {
                setShowCreateModal(false);
                await refreshCampaigns();
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
