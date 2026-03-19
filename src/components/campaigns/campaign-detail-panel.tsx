"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CampaignForm, CampaignFormPayload } from "@/components/forms/campaign-form";
import { formatCurrency, formatDate } from "@/lib/utils";

export type CampaignDetailPayload = {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    status: "Active" | "Inactive";
    start_date: string | null;
    end_date: string | null;
    campaign_tag_id?: string | null;
    campaign_tag_label?: string | null;
  } | null;
  donations: Array<Record<string, unknown>>;
  childCampaigns?: Array<Record<string, unknown>>;
  totalAmount: number;
};

type ChildCampaignDraft = {
  id: string;
  name: string;
  description: string;
  status: "Active" | "Inactive";
  startDate: string;
  endDate: string;
  campaignTagId: string;
  campaignTagLabel?: string;
};

type ParentCampaignDraft = {
  name: string;
  description: string;
  status: "Active" | "Inactive";
  startDate: string;
  endDate: string;
  campaignTagId: string;
  campaignTagLabel?: string;
};

export function CampaignDetailPanel({
  campaignId,
  initialData
}: {
  campaignId: string;
  initialData: CampaignDetailPayload;
}) {
  const [data, setData] = useState(initialData);
  const [showCreateChild, setShowCreateChild] = useState(false);
  const [editingChild, setEditingChild] = useState<ChildCampaignDraft | null>(null);
  const [editingParent, setEditingParent] = useState<ParentCampaignDraft | null>(null);
  const [activeTab, setActiveTab] = useState<"children" | "donations">("children");
  const [expandedChildDonationId, setExpandedChildDonationId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const campaign = data.campaign;
  const childDonationMap = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const donation of data.donations) {
      const childId = String(donation.sub_campaign_id ?? "");
      if (!childId) continue;
      const rows = map.get(childId) ?? [];
      rows.push(donation);
      map.set(childId, rows);
    }
    return map;
  }, [data.donations]);

  async function refreshCampaign() {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to refresh campaign.");
    setData(payload as CampaignDetailPayload);
  }

  async function createChild(values: CampaignFormPayload) {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/children`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to create child campaign.");
  }

  async function updateChild(values: CampaignFormPayload) {
    if (!editingChild) return;
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/children/${encodeURIComponent(editingChild.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values)
      }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to update child campaign.");
  }

  async function updateParent(values: CampaignFormPayload) {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to update parent campaign.");
  }

  if (!campaign) return null;

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <Card>
        <CardHeader title={campaign.name} subtitle={campaign.description ?? "No description"} />
        <div className="mb-3 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setEditingParent({
                name: campaign.name,
                description: campaign.description ?? "",
                status: campaign.status,
                startDate: campaign.start_date ?? "",
                endDate: campaign.end_date ?? "",
                campaignTagId: String(campaign.campaign_tag_id ?? ""),
                campaignTagLabel: String(campaign.campaign_tag_label ?? "")
              })
            }
          >
            Edit Campaign
          </Button>
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-5">
          <div>
            <p className="text-slate-500">Status</p>
            <p>{campaign.status}</p>
          </div>
          <div>
            <p className="text-slate-500">Start Date</p>
            <p>{formatDate(campaign.start_date)}</p>
          </div>
          <div>
            <p className="text-slate-500">End Date</p>
            <p>{formatDate(campaign.end_date)}</p>
          </div>
          <div>
            <p className="text-slate-500">Total Donations (Parent Rollup)</p>
            <p>{formatCurrency(data.totalAmount)}</p>
          </div>
          <div>
            <p className="text-slate-500">Campaign Tag</p>
            <p>{String(campaign.campaign_tag_label ?? "-")}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={activeTab === "children" ? "primary" : "secondary"}
              onClick={() => setActiveTab("children")}
            >
              Child Campaigns
            </Button>
            <Button
              type="button"
              variant={activeTab === "donations" ? "primary" : "secondary"}
              onClick={() => setActiveTab("donations")}
            >
              Campaign Donations
            </Button>
          </div>
          {activeTab === "children" ? (
            <Button type="button" onClick={() => setShowCreateChild(true)}>
              Add Child Campaign
            </Button>
          ) : null}
        </div>

        {activeTab === "children" ? (
          <>
            <CardHeader
              title="Child Campaigns"
              subtitle="Child campaigns tied to this parent campaign."
            />
            <div className="space-y-2">
              {(data.childCampaigns ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No child campaigns yet.</p>
              ) : (
                (data.childCampaigns ?? []).map((child) => {
                  const childId = String(child.id ?? "");
                  const childDonations = childDonationMap.get(childId) ?? [];
                  const isExpanded = expandedChildDonationId === childId;
                  return (
                    <div
                      key={childId}
                      className="cursor-pointer rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                      onClick={() =>
                        setEditingChild({
                          id: childId,
                          name: String(child.name ?? ""),
                          description: String(child.description ?? ""),
                          status: String(child.status ?? "Active") as "Active" | "Inactive",
                          startDate:
                            typeof child.start_date === "string" ? String(child.start_date) : "",
                          endDate: typeof child.end_date === "string" ? String(child.end_date) : "",
                          campaignTagId: String(child.campaign_tag_id ?? ""),
                          campaignTagLabel: String(child.campaign_tag_label ?? "")
                        })
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{String(child.name ?? "-")}</p>
                          <p className="text-xs text-slate-600">{String(child.description ?? "-")}</p>
                          <p className="text-xs text-slate-500">
                            {formatDate(
                              typeof child.start_date === "string" ? String(child.start_date) : null
                            )}{" "}
                            -{" "}
                            {formatDate(
                              typeof child.end_date === "string" ? String(child.end_date) : null
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            Raised: {formatCurrency(Number(child.total_amount ?? 0))}
                          </p>
                          <p className="text-xs text-slate-500">
                            Donations: {childDonations.length}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedChildDonationId((previous) =>
                                previous === childId ? null : childId
                              );
                            }}
                          >
                            {isExpanded ? "Hide Donations" : "View Donations"}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingChild({
                                id: childId,
                                name: String(child.name ?? ""),
                                description: String(child.description ?? ""),
                                status: String(child.status ?? "Active") as "Active" | "Inactive",
                                startDate:
                                  typeof child.start_date === "string"
                                    ? String(child.start_date)
                                    : "",
                                endDate:
                                  typeof child.end_date === "string" ? String(child.end_date) : "",
                                campaignTagId: String(child.campaign_tag_id ?? ""),
                                campaignTagLabel: String(child.campaign_tag_label ?? "")
                              });
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                          <p className="mb-1 text-xs font-semibold text-slate-700">
                            Donations for {String(child.name ?? "Child Campaign")}
                          </p>
                          <div className="space-y-1">
                            {childDonations.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                No donations for this child campaign yet.
                              </p>
                            ) : (
                              childDonations.map((donation) => {
                                const donor = Array.isArray(donation.contacts)
                                  ? donation.contacts[0]
                                  : donation.contacts;
                                return (
                                  <Link
                                    key={`child-${String(donation.id)}`}
                                    href={`/staff/financial/donations/${encodeURIComponent(String(donation.id))}`}
                                    className="block rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-slate-900">
                                        {formatCurrency(Number(donation.amount ?? 0))}
                                      </span>
                                      <span className="text-slate-500">
                                        {formatDate((donation.donation_date as string | null) ?? null)}
                                      </span>
                                    </div>
                                    <p className="text-slate-600">
                                      {String((donor as { first_name?: string })?.first_name ?? "")}{" "}
                                      {String((donor as { last_name?: string })?.last_name ?? "")}
                                    </p>
                                  </Link>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            <CardHeader
              title="Campaign Donations"
              subtitle="Donations tied to this parent campaign."
            />
            <div className="space-y-2">
              {data.donations.length === 0 ? (
                <p className="text-sm text-slate-500">No donations tied to this campaign yet.</p>
              ) : (
                data.donations.map((donation) => {
                  const donor = Array.isArray(donation.contacts) ? donation.contacts[0] : donation.contacts;
                  const child = Array.isArray(donation.sub_campaigns)
                    ? donation.sub_campaigns[0]
                    : donation.sub_campaigns;
                  return (
                    <Link
                      key={String(donation.id)}
                      href={`/staff/financial/donations/${encodeURIComponent(String(donation.id))}`}
                      className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatCurrency(Number(donation.amount ?? 0))}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate((donation.donation_date as string | null) ?? null)}
                        </p>
                      </div>
                      <p className="text-xs text-slate-600">
                        {String((donor as { first_name?: string })?.first_name ?? "")}{" "}
                        {String((donor as { last_name?: string })?.last_name ?? "")} •{" "}
                        {String(donation.payment_type ?? "-")}
                      </p>
                      {child && (child as { name?: string }).name ? (
                        <p className="text-xs text-slate-500">
                          Child: {String((child as { name?: string }).name)}
                        </p>
                      ) : null}
                    </Link>
                  );
                })
              )}
            </div>
          </>
        )}
      </Card>

      {showCreateChild ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">Add Child Campaign</h4>
              <Button type="button" variant="secondary" onClick={() => setShowCreateChild(false)}>
                Close
              </Button>
            </div>
            <CampaignForm
              onCancel={() => setShowCreateChild(false)}
              onSubmitCampaign={async (values) => {
                await createChild(values);
              }}
              onSuccess={async () => {
                setShowCreateChild(false);
                await refreshCampaign();
                setMessage("Child campaign created.");
                setError(null);
              }}
              submitLabel="Create Child Campaign"
              requireDateRange
              parentDateBounds={{
                startDate: campaign.start_date,
                endDate: campaign.end_date
              }}
            />
          </div>
        </div>
      ) : null}

      {editingChild ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">Edit Child Campaign</h4>
              <Button type="button" variant="secondary" onClick={() => setEditingChild(null)}>
                Close
              </Button>
            </div>
            <CampaignForm
              onCancel={() => setEditingChild(null)}
              onSubmitCampaign={async (values) => {
                await updateChild(values);
              }}
              onSuccess={async () => {
                setEditingChild(null);
                await refreshCampaign();
                setMessage("Child campaign updated.");
                setError(null);
              }}
              initialValues={editingChild}
              submitLabel="Save Child Campaign"
              requireDateRange
              parentDateBounds={{
                startDate: campaign.start_date,
                endDate: campaign.end_date
              }}
            />
          </div>
        </div>
      ) : null}

      {editingParent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">Edit Parent Campaign</h4>
              <Button type="button" variant="secondary" onClick={() => setEditingParent(null)}>
                Close
              </Button>
            </div>
            <CampaignForm
              onCancel={() => setEditingParent(null)}
              onSubmitCampaign={async (values) => {
                await updateParent(values);
              }}
              onSuccess={async () => {
                setEditingParent(null);
                await refreshCampaign();
                setMessage("Parent campaign updated.");
                setError(null);
              }}
              initialValues={editingParent}
              submitLabel="Save Campaign"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
