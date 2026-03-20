"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function GivingFuelReviewDetail({ importId }: { importId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payload, setPayload] = useState<{
    item: Record<string, unknown>;
    event: Record<string, unknown> | null;
    actions: Array<Record<string, unknown>>;
  } | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [donorId, setDonorId] = useState("");
  const [notes, setNotes] = useState("");
  const [createNewDonor, setCreateNewDonor] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/givingfuel/review/${encodeURIComponent(importId)}`, {
        cache: "no-store"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message ?? "Failed to load review detail.");
      }
      setPayload(body);
      const item = (body as { item?: Record<string, unknown> }).item ?? {};
      setCampaignId(String(item.matched_campaign_id ?? ""));
      setDonorId(String(item.matched_donor_id ?? ""));
      setNotes(String(item.review_notes ?? ""));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load review detail.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId]);

  async function applyAction(action: "approve" | "reject" | "ignore" | "reprocess") {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/givingfuel/review/${encodeURIComponent(importId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? {
                action,
                campaignId: campaignId || null,
                donorId: donorId || null,
                createNewDonor,
                notes: notes || null
              }
            : action === "reprocess"
              ? { action }
              : { action, notes: notes || null }
        )
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message ?? "Review action failed.");
      }
      setMessage("Action completed.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Review action failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Loading review detail...</p>;
  }

  if (!payload) {
    return <p className="text-sm text-rose-700">Unable to load this review item.</p>;
  }

  const item = payload.item;
  const donor = (item.normalized_donor_json as Record<string, unknown> | null | undefined) ?? {};
  const tx = (item.normalized_transaction_json as Record<string, unknown> | null | undefined) ?? {};

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => router.push("/staff/data-tools/giving-fuel")}>
          Back to Queue
        </Button>
      </div>

      <section className="space-y-2 rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Source Values</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Value label="Webhook Event ID" value={String(item.webhook_event_id ?? "-")} />
          <Value label="External Transaction ID" value={String(item.external_transaction_id ?? "-")} />
          <Value label="External Page ID" value={String(item.external_page_id ?? "-")} />
          <Value label="External Donor Reference" value={String(item.external_donor_reference ?? "-")} />
          <Value label="Donor Name" value={`${String(donor.firstName ?? "")} ${String(donor.lastName ?? "")}`.trim() || "-"} />
          <Value label="Donor Email" value={String(donor.email ?? "-")} />
          <Value label="Amount" value={String(tx.amount ?? "-")} />
          <Value label="Donation Date" value={String(tx.donationDate ?? "-")} />
          <Value label="Transaction Status" value={String(tx.status ?? tx.paymentStatus ?? "-")} />
          <Value label="Payment Method" value={String(tx.paymentMethod ?? "-")} />
          <Value label="Campaign Match Rule" value={`${String(item.campaign_match_rule ?? "-")} (${String(item.campaign_match_confidence ?? "0")})`} />
          <Value label="Donor Match Rule" value={`${String(item.donor_match_rule ?? "-")} (${String(item.donor_match_confidence ?? "0")})`} />
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Review Decision</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
              Campaign ID
            </label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
              Donor ID
            </label>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={donorId}
              onChange={(event) => setDonorId(event.target.value)}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">
              Review Notes
            </label>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
            <input
              type="checkbox"
              checked={createNewDonor}
              onChange={(event) => setCreateNewDonor(event.target.checked)}
            />
            Create new donor if Donor ID is blank on approve
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void applyAction("approve")} disabled={saving}>
            Approve
          </Button>
          <Button type="button" variant="secondary" onClick={() => void applyAction("reprocess")} disabled={saving}>
            Reprocess
          </Button>
          <Button type="button" variant="secondary" onClick={() => void applyAction("ignore")} disabled={saving}>
            Ignore
          </Button>
          <Button type="button" variant="danger" onClick={() => void applyAction("reject")} disabled={saving}>
            Reject
          </Button>
        </div>
      </section>

      <section className="space-y-2 rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Audit Trail</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">When</th>
                <th className="py-2">Action</th>
                <th className="py-2">Performed By</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {payload.actions.map((action) => (
                <tr key={String(action.id)} className="border-b border-slate-100">
                  <td className="py-2">{formatDateTime(String(action.created_at ?? ""))}</td>
                  <td className="py-2">{String(action.action_type ?? "-")}</td>
                  <td className="py-2">{String(action.performed_by_user_id ?? "-")}</td>
                  <td className="py-2">{String(action.notes ?? "-")}</td>
                </tr>
              ))}
              {payload.actions.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={4}>
                    No review actions have been recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}
