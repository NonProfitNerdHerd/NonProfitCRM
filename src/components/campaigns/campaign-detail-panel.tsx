"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CampaignForm, CampaignFormPayload } from "@/components/forms/campaign-form";
import { formatCurrency, formatDate } from "@/lib/utils";

type CampaignDetailPayload = {
  campaign: {
    id: string;
    name: string;
    description: string | null;
    status: "Active" | "Inactive";
    start_date: string | null;
    end_date: string | null;
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const campaign = data.campaign;

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

  if (!campaign) return null;

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <Card>
        <CardHeader title={campaign.name} subtitle={campaign.description ?? "No description"} />
        <div className="mb-3 flex justify-end">
          <Button type="button" onClick={() => setShowCreateChild(true)}>
            Add Child Campaign
          </Button>
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-4">
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
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Child Campaigns"
          subtitle="Child campaigns tied to this parent campaign."
        />
        <div className="space-y-2">
          {(data.childCampaigns ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No child campaigns yet.</p>
          ) : (
            (data.childCampaigns ?? []).map((child) => (
              <div
                key={String(child.id)}
                className="cursor-pointer rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                onClick={() =>
                  setEditingChild({
                    id: String(child.id ?? ""),
                    name: String(child.name ?? ""),
                    description: String(child.description ?? ""),
                    status: String(child.status ?? "Active") as "Active" | "Inactive",
                    startDate:
                      typeof child.start_date === "string" ? String(child.start_date) : "",
                    endDate: typeof child.end_date === "string" ? String(child.end_date) : ""
                  })
                }
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{String(child.name ?? "-")}</p>
                    <p className="text-xs text-slate-600">{String(child.description ?? "-")}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(
                        typeof child.start_date === "string" ? String(child.start_date) : null
                      )}{" "}
                      -{" "}
                      {formatDate(typeof child.end_date === "string" ? String(child.end_date) : null)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Raised: {formatCurrency(Number(child.total_amount ?? 0))}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingChild({
                        id: String(child.id ?? ""),
                        name: String(child.name ?? ""),
                        description: String(child.description ?? ""),
                        status: String(child.status ?? "Active") as "Active" | "Inactive",
                        startDate:
                          typeof child.start_date === "string" ? String(child.start_date) : "",
                        endDate: typeof child.end_date === "string" ? String(child.end_date) : ""
                      });
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Campaign Donations" subtitle="Donations tied to this parent campaign." />
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
                    <p className="text-xs text-slate-500">Child: {String((child as { name?: string }).name)}</p>
                  ) : null}
                </Link>
              );
            })
          )}
        </div>
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
    </div>
  );
}
