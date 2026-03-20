"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DashboardPayload = {
  moduleState: {
    connectionId: string | null;
    integrationEnabled: boolean;
    allowModuleAccess: boolean;
    pendingReviewCount: number;
    failedEventsCount: number;
  };
  summary: {
    pendingReview: number;
    processed: number;
    failed: number;
    ignored: number;
  };
  recentEvents: Array<Record<string, unknown>>;
};

type ReviewPayload = {
  moduleState: {
    connectionId: string | null;
    integrationEnabled: boolean;
    allowModuleAccess: boolean;
    pendingReviewCount: number;
    failedEventsCount: number;
  };
  rows: Array<Record<string, unknown>>;
};

type MappingPayload = {
  campaigns: Array<{ id: string; name: string; status: string }>;
  mappings: Array<{
    id: string;
    external_page_id: string;
    external_page_key: string | null;
    external_page_name: string | null;
    crm_campaign_id: string;
    is_active: boolean;
    notes: string | null;
  }>;
};

type InboxPayload = {
  moduleState: {
    connectionId: string | null;
    integrationEnabled: boolean;
    allowModuleAccess: boolean;
    pendingReviewCount: number;
    failedEventsCount: number;
  };
  rows: Array<Record<string, unknown>>;
};

export function GivingFuelOperationsDashboard({
  initialDashboard,
  initialReview,
  initialMappings,
  initialInbox
}: {
  initialDashboard: DashboardPayload;
  initialReview: ReviewPayload;
  initialMappings: MappingPayload;
  initialInbox: InboxPayload;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [review, setReview] = useState(initialReview);
  const [mappings, setMappings] = useState(initialMappings);
  const [inbox, setInbox] = useState(initialInbox);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"queue" | "mapping" | "inbox">("queue");
  const [inboxProcessingStatus, setInboxProcessingStatus] = useState("all");
  const [inboxValidationStatus, setInboxValidationStatus] = useState("all");
  const [inboxWebhookId, setInboxWebhookId] = useState("");
  const [inboxDateFrom, setInboxDateFrom] = useState("");
  const [inboxDateTo, setInboxDateTo] = useState("");
  const [inboxLimit, setInboxLimit] = useState(50);
  const [selectedInboxEventId, setSelectedInboxEventId] = useState<string | null>(null);
  const [selectedInboxDetail, setSelectedInboxDetail] = useState<Record<string, unknown> | null>(null);
  const [mappingDraft, setMappingDraft] = useState({
    externalPageId: "",
    externalPageKey: "",
    externalPageName: "",
    crmCampaignId: "",
    isActive: true,
    notes: ""
  });

  async function loadDashboard() {
    const dashboardResponse = await fetch("/api/givingfuel/dashboard", { cache: "no-store" });
    const dashboardPayload = await dashboardResponse.json().catch(() => null);
    if (!dashboardResponse.ok) {
      throw new Error(dashboardPayload?.message ?? "Failed to load Giving Fuel dashboard.");
    }
    setDashboard(dashboardPayload as DashboardPayload);
  }

  async function loadReview() {
    const statusParam = statusFilter === "all" ? "" : `status=${encodeURIComponent(statusFilter)}&`;
    const reviewResponse = await fetch(
      `/api/givingfuel/review?${statusParam}search=${encodeURIComponent(search)}`,
      { cache: "no-store" }
    );
    const reviewPayload = await reviewResponse.json().catch(() => null);
    if (!reviewResponse.ok) {
      throw new Error(reviewPayload?.message ?? "Failed to load Giving Fuel review queue.");
    }
    setReview(reviewPayload as ReviewPayload);
  }

  async function loadMappings() {
    const response = await fetch("/api/givingfuel/mappings", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Failed to load campaign mappings.");
    setMappings(payload as MappingPayload);
  }

  async function loadInbox() {
    const processingStatusParam =
      inboxProcessingStatus === "all"
        ? ""
        : `processingStatus=${encodeURIComponent(inboxProcessingStatus)}&`;
    const validationStatusParam =
      inboxValidationStatus === "all"
        ? ""
        : `validationStatus=${encodeURIComponent(inboxValidationStatus)}&`;
    const webhookIdParam = inboxWebhookId.trim()
      ? `webhookId=${encodeURIComponent(inboxWebhookId.trim())}&`
      : "";
    const dateFromParam = inboxDateFrom ? `dateFrom=${encodeURIComponent(inboxDateFrom)}&` : "";
    const dateToParam = inboxDateTo ? `dateTo=${encodeURIComponent(inboxDateTo)}&` : "";
    const response = await fetch(
      `/api/givingfuel/webhook-inbox?${processingStatusParam}${validationStatusParam}${webhookIdParam}${dateFromParam}${dateToParam}limit=${encodeURIComponent(String(inboxLimit))}`,
      { cache: "no-store" }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Failed to load webhook inbox.");
    setInbox(payload as InboxPayload);
  }

  async function loadInboxDetail(eventId: string) {
    const response = await fetch(`/api/givingfuel/webhook-inbox/${encodeURIComponent(eventId)}`, {
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Failed to load webhook event detail.");
    setSelectedInboxEventId(eventId);
    setSelectedInboxDetail(payload?.event ?? null);
  }

  async function replayInboxEvent(eventId: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/givingfuel/webhook-inbox/${encodeURIComponent(eventId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "replay" })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Failed to replay webhook event.");
      await Promise.all([loadInbox(), loadDashboard(), loadReview()]);
      if (selectedInboxEventId === eventId) {
        setSelectedInboxDetail(null);
        setSelectedInboxEventId(null);
      }
    } catch (replayError) {
      setError(replayError instanceof Error ? replayError.message : "Failed to replay webhook event.");
    } finally {
      setSaving(false);
    }
  }

  async function loadAll() {
    setError(null);
    try {
      await Promise.all([loadDashboard(), loadReview(), loadMappings(), loadInbox()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data.");
    }
  }

  useEffect(() => {
    void loadReview().catch((loadError) =>
      setError(loadError instanceof Error ? loadError.message : "Failed to load review queue.")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return review.rows;
    return review.rows.filter((row) => {
      const donor = (row.normalized_donor_json as Record<string, unknown> | null | undefined) ?? {};
      const donorName = `${String(donor.firstName ?? "")} ${String(donor.lastName ?? "")} ${String(
        donor.organizationName ?? ""
      )}`
        .trim()
        .toLowerCase();
      const email = String(donor.email ?? "").toLowerCase();
      const externalTransactionId = String(row.external_transaction_id ?? "").toLowerCase();
      const pageId = String(row.external_page_id ?? "").toLowerCase();
      return (
        donorName.includes(normalized) ||
        email.includes(normalized) ||
        externalTransactionId.includes(normalized) ||
        pageId.includes(normalized)
      );
    });
  }, [review.rows, search]);

  async function bulkApprove() {
    if (selectedIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/givingfuel/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importIds: selectedIds })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Bulk approval failed.");
      setSelectedIds([]);
      await loadAll();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Bulk approval failed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMapping() {
    if (!mappingDraft.externalPageId.trim() || !mappingDraft.crmCampaignId.trim()) {
      setError("External Page ID and CRM Campaign are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/givingfuel/mappings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          externalPageId: mappingDraft.externalPageId.trim(),
          externalPageKey: mappingDraft.externalPageKey.trim() || null,
          externalPageName: mappingDraft.externalPageName.trim() || null,
          crmCampaignId: mappingDraft.crmCampaignId,
          isActive: mappingDraft.isActive,
          notes: mappingDraft.notes.trim() || null
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Failed to save mapping.");
      setMappingDraft({
        externalPageId: "",
        externalPageKey: "",
        externalPageName: "",
        crmCampaignId: "",
        isActive: true,
        notes: ""
      });
      await Promise.all([loadMappings(), loadDashboard()]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMapping(mappingId: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/givingfuel/mappings/${encodeURIComponent(mappingId)}`, {
        method: "DELETE"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Failed to delete mapping.");
      await loadMappings();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete mapping.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {!dashboard.moduleState.integrationEnabled ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          GivingFuel module is visible, but integration processing is disabled. Webhook deliveries are
          stored without processing until integration is enabled.
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Pending Review" value={dashboard.summary.pendingReview} />
        <Metric label="Processed" value={dashboard.summary.processed} />
        <Metric label="Failed/Invalid" value={dashboard.summary.failed} />
        <Metric label="Ignored" value={dashboard.summary.ignored} />
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <Button type="button" variant={activeTab === "queue" ? "primary" : "secondary"} onClick={() => setActiveTab("queue")}>
            Transaction Review Queue
          </Button>
          <Button type="button" variant={activeTab === "mapping" ? "primary" : "secondary"} onClick={() => setActiveTab("mapping")}>
            Campaign Configuration
          </Button>
          <Button type="button" variant={activeTab === "inbox" ? "primary" : "secondary"} onClick={() => setActiveTab("inbox")}>
            Webhook Inbox
          </Button>
        </div>

        {activeTab === "queue" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Transaction Review Queue</h3>
              <div className="flex gap-2">
                <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All Statuses</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="auto_accepted">Auto Accepted</option>
                  <option value="approved">Approved</option>
                  <option value="corrected">Corrected</option>
                  <option value="rejected">Rejected</option>
                  <option value="ignored">Ignored</option>
                </select>
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search donor/email/transaction/page" />
                <Button type="button" variant="secondary" onClick={() => void loadAll()}>
                  Refresh
                </Button>
                <Button type="button" onClick={() => void bulkApprove()} disabled={saving || selectedIds.length === 0}>
                  {saving ? "Approving..." : `Bulk Approve (${selectedIds.length})`}
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Select</th>
                    <th className="py-2">Created</th>
                    <th className="py-2">Donor</th>
                    <th className="py-2">Transaction ID</th>
                    <th className="py-2">Campaign Match</th>
                    <th className="py-2">Donor Match</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const id = String(row.id ?? "");
                    const donor = (row.normalized_donor_json as Record<string, unknown> | null | undefined) ?? {};
                    const tx = (row.normalized_transaction_json as Record<string, unknown> | null | undefined) ?? {};
                    return (
                      <tr key={id} className="border-b border-slate-100">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(id)}
                            onChange={(event) =>
                              setSelectedIds((prev) =>
                                event.target.checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)
                              )
                            }
                          />
                        </td>
                        <td className="py-2">{formatDateTime(String(row.created_at ?? ""))}</td>
                        <td className="py-2">
                          {String(donor.firstName ?? "")} {String(donor.lastName ?? "")}
                          {String(donor.organizationName ?? "") ? ` (${String(donor.organizationName)})` : ""}
                          <div className="text-xs text-slate-500">{String(donor.email ?? "")}</div>
                        </td>
                        <td className="py-2">{String(row.external_transaction_id ?? "-")}</td>
                        <td className="py-2">{String(row.campaign_match_rule ?? "-")} ({Number(row.campaign_match_confidence ?? 0)})</td>
                        <td className="py-2">{String(row.donor_match_rule ?? "-")} ({Number(row.donor_match_confidence ?? 0)})</td>
                        <td className="py-2">{Number(tx.amount ?? 0).toLocaleString()}</td>
                        <td className="py-2">{String(row.review_status ?? "-")}</td>
                        <td className="py-2">
                          <Link href={`/staff/data-tools/giving-fuel/review/${encodeURIComponent(id)}`} className="text-sm font-medium text-blue-700 underline">
                            Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={9}>
                        No review items found for these filters. Check Webhook Inbox to confirm whether
                        deliveries were failed/invalid, ignored, or auto-processed.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {activeTab === "mapping" ? (
          <>
            <h3 className="text-sm font-semibold text-slate-900">Campaign Configuration (Page → CRM Campaign)</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <Input value={mappingDraft.externalPageId} onChange={(event) => setMappingDraft((prev) => ({ ...prev, externalPageId: event.target.value }))} placeholder="External Page ID *" />
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={mappingDraft.crmCampaignId}
                onChange={(event) => setMappingDraft((prev) => ({ ...prev, crmCampaignId: event.target.value }))}
              >
                <option value="">Select CRM Campaign *</option>
                {mappings.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
              <Input value={mappingDraft.externalPageKey} onChange={(event) => setMappingDraft((prev) => ({ ...prev, externalPageKey: event.target.value }))} placeholder="External Page Key (optional)" />
              <Input value={mappingDraft.externalPageName} onChange={(event) => setMappingDraft((prev) => ({ ...prev, externalPageName: event.target.value }))} placeholder="External Page Name (optional)" />
              <Input value={mappingDraft.notes} onChange={(event) => setMappingDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes (optional)" />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={mappingDraft.isActive} onChange={(event) => setMappingDraft((prev) => ({ ...prev, isActive: event.target.checked }))} />
                Mapping Active
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void saveMapping()} disabled={saving}>
                Save Mapping
              </Button>
              <Button type="button" variant="secondary" onClick={() => void loadMappings()}>
                Refresh Mappings
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">External Page ID</th>
                    <th className="py-2">Page Key</th>
                    <th className="py-2">Page Name</th>
                    <th className="py-2">Campaign</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.mappings.map((mapping) => (
                    <tr key={mapping.id} className="border-b border-slate-100">
                      <td className="py-2">{mapping.external_page_id}</td>
                      <td className="py-2">{mapping.external_page_key || "-"}</td>
                      <td className="py-2">{mapping.external_page_name || "-"}</td>
                      <td className="py-2">{mappings.campaigns.find((campaign) => campaign.id === mapping.crm_campaign_id)?.name || mapping.crm_campaign_id}</td>
                      <td className="py-2">{mapping.is_active ? "Active" : "Inactive"}</td>
                      <td className="py-2">
                        <Button type="button" variant="danger" onClick={() => void deleteMapping(mapping.id)} disabled={saving}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {mappings.mappings.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={6}>
                        No page-to-campaign mappings configured.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {activeTab === "inbox" ? (
          <>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Webhook Inbox</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <label className="block text-xs text-slate-600">Processing Status</label>
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={inboxProcessingStatus}
                    onChange={(event) => setInboxProcessingStatus(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="received">Received</option>
                    <option value="processed">Processed</option>
                    <option value="failed">Failed</option>
                    <option value="ignored">Ignored</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-600">Validation Status</label>
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={inboxValidationStatus}
                    onChange={(event) => setInboxValidationStatus(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="valid">Valid</option>
                    <option value="invalid">Invalid</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-600">Webhook ID</label>
                  <Input
                    value={inboxWebhookId}
                    onChange={(event) => setInboxWebhookId(event.target.value)}
                    placeholder="Connection/Webhook ID"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-600">From</label>
                  <Input type="date" value={inboxDateFrom} onChange={(event) => setInboxDateFrom(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-600">To</label>
                  <Input type="date" value={inboxDateTo} onChange={(event) => setInboxDateTo(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-600">Rows</label>
                  <select
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={inboxLimit}
                    onChange={(event) => setInboxLimit(Number(event.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                  </select>
                </div>
                <Button type="button" variant="secondary" onClick={() => void loadInbox()}>
                  Apply Filters
                </Button>
                <Button type="button" variant="secondary" onClick={() => void loadInbox()}>
                  Refresh Inbox
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Received</th>
                    <th className="py-2">Webhook ID</th>
                    <th className="py-2">Event Type</th>
                    <th className="py-2">Provider Event</th>
                    <th className="py-2">Validation</th>
                    <th className="py-2">Processing</th>
                    <th className="py-2">HTTP</th>
                    <th className="py-2">Test</th>
                    <th className="py-2">Error</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inbox.rows.map((row) => (
                    <tr key={String(row.id)} className="border-b border-slate-100">
                      <td className="py-2">{formatDateTime(String(row.received_at ?? ""))}</td>
                      <td className="py-2">{String(row.webhook_route_id ?? "-")}</td>
                      <td className="py-2">{String(row.event_type ?? "-")}</td>
                      <td className="py-2">{String(row.provider_event_id ?? "-")}</td>
                      <td className="py-2">{String(row.validation_status ?? "-")}</td>
                      <td className="py-2">{String(row.processing_status ?? "-")}</td>
                      <td className="py-2">{String(row.response_status_code ?? "-")}</td>
                      <td className="py-2">{Boolean(row.is_test_event) ? "Yes" : "No"}</td>
                      <td className="py-2">{String(row.error_message ?? "-")}</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void loadInboxDetail(String(row.id))}
                          >
                            View
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void replayInboxEvent(String(row.id))}
                            disabled={saving}
                          >
                            Replay
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {inbox.rows.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={10}>
                        No webhook inbox records found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {selectedInboxEventId && selectedInboxDetail ? (
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <h4 className="text-sm font-semibold text-slate-900">Webhook Detail</h4>
                <div className="grid gap-2 text-xs md:grid-cols-2">
                  <Detail label="Webhook ID" value={String(selectedInboxDetail.webhook_route_id ?? "-")} />
                  <Detail label="Method" value={String(selectedInboxDetail.request_method ?? "-")} />
                  <Detail label="URL" value={String(selectedInboxDetail.request_url ?? "-")} />
                  <Detail label="Validation" value={String(selectedInboxDetail.validation_status ?? "-")} />
                  <Detail label="Processing" value={String(selectedInboxDetail.processing_status ?? "-")} />
                  <Detail label="Response Status" value={String(selectedInboxDetail.response_status_code ?? "-")} />
                  <Detail label="Matched Integration" value={String(selectedInboxDetail.matched_integration_id ?? "-")} />
                  <Detail label="Matched Campaign" value={String(selectedInboxDetail.matched_campaign_id ?? "-")} />
                  <Detail label="Matched Donor" value={String(selectedInboxDetail.matched_donor_id ?? "-")} />
                  <Detail label="Error" value={String(selectedInboxDetail.error_message ?? "-")} />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <JsonBlock title="Headers" value={selectedInboxDetail.request_headers} />
                  <JsonBlock title="Parsed Body" value={selectedInboxDetail.parsed_body_json} />
                  <JsonBlock title="Raw Body" value={selectedInboxDetail.raw_body_text} />
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value.toLocaleString()}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-2 py-1">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-slate-800">{value}</p>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const text =
    typeof value === "string"
      ? value
      : JSON.stringify(value ?? {}, null, 2);
  return (
    <div className="rounded border border-slate-200 bg-white p-2">
      <p className="mb-1 text-xs font-semibold text-slate-700">{title}</p>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">
        {text}
      </pre>
    </div>
  );
}
