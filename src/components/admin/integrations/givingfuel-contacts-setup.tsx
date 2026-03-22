"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type DetailPayload = {
  definition: Record<string, unknown>;
  connection: Record<string, unknown>;
  jobs: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  overview: Record<string, unknown>;
  syncState?: Record<string, unknown> | null;
  apiPaused?: boolean;
};

type SyncedContact = {
  externalRecordId: string;
  lastSyncedDate: string | null;
  sourceSystem: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    city: string;
    state: string;
    updatedAt: string | null;
  };
};

export function GivingFuelContactsSetup({
  integrationKey,
  initialData
}: {
  integrationKey: string;
  initialData: DetailPayload;
}) {
  const [data, setData] = useState(initialData);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState<
    "test" | "save" | "full-sync" | "incremental-sync" | "reset-state" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactsLimit, setContactsLimit] = useState<20 | 50 | 100>(20);
  const [syncedContacts, setSyncedContacts] = useState<SyncedContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"contacts" | "errors" | "history">("contacts");
  const [errorStatusFilter, setErrorStatusFilter] = useState<"open" | "resolved">("open");
  const [resolvingErrorId, setResolvingErrorId] = useState<string | null>(null);
  const [bulkResolving, setBulkResolving] = useState(false);
  const [bulkResolveProgress, setBulkResolveProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [payloadViewer, setPayloadViewer] = useState<Record<string, unknown> | null>(null);
  const [jobViewer, setJobViewer] = useState<{
    job: Record<string, unknown> | null;
    logs: Array<Record<string, unknown>>;
  } | null>(null);

  const apiPaused = Boolean(data.apiPaused);
  const config = (data.connection.configuration_json as Record<string, unknown>) ?? {};
  const apiKeyConfigured = Boolean(config.apiKeyConfigured);

  async function refresh() {
    const response = await fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to refresh integration.");
    setData(payload as DetailPayload);
  }

  async function loadSyncedContacts(limit: 20 | 50 | 100 = contactsLimit) {
    setContactsLoading(true);
    setContactsError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/contacts?limit=${String(limit)}`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to load synced contacts.");
      }
      setSyncedContacts((payload?.contacts ?? []) as SyncedContact[]);
    } catch (loadError) {
      setContactsError(loadError instanceof Error ? loadError.message : "Unable to load synced contacts.");
    } finally {
      setContactsLoading(false);
    }
  }

  async function runAction(
    action: "test" | "save" | "full-sync" | "incremental-sync" | "reset-state",
    request: () => Promise<Response>,
    successMessage: string
  ) {
    setLoading(action);
    setMessage(null);
    setError(null);
    try {
      const response = await request();
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Request failed.");
      }
      await refresh();
      await loadSyncedContacts();
      setMessage(payload?.message ?? successMessage);
      if (action === "save") setApiKey("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Request failed.");
    } finally {
      setLoading(null);
    }
  }

  async function resolveError(errorId: string) {
    setResolvingErrorId(errorId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/errors/${encodeURIComponent(errorId)}/resolve`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to resolve error.");
      await refresh();
      setMessage(payload?.message ?? "Retry succeeded and error resolved.");
    } catch (resolveErrorValue) {
      setError(resolveErrorValue instanceof Error ? resolveErrorValue.message : "Unable to resolve error.");
    } finally {
      setResolvingErrorId(null);
    }
  }

  async function resolveAllOpenErrors() {
    setMessage(null);
    setError(null);

    if (openErrors.length === 0) {
      setMessage("No open errors to resolve.");
      return;
    }

    setBulkResolving(true);
    setBulkResolveProgress({ done: 0, total: openErrors.length });

    let resolvedCount = 0;
    let failedCount = 0;
    try {
      for (let index = 0; index < openErrors.length; index += 1) {
        const row = openErrors[index];
        const errorId = String(row.id ?? "");
        setBulkResolveProgress({ done: index, total: openErrors.length });

        if (!errorId) {
          failedCount += 1;
          continue;
        }

        try {
          const response = await fetch(
            `/api/admin/integrations/${encodeURIComponent(integrationKey)}/errors/${encodeURIComponent(errorId)}/resolve`,
            { method: "POST" }
          );
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.message ?? "Unable to resolve error.");
          }
          resolvedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      setBulkResolveProgress({ done: openErrors.length, total: openErrors.length });
      await refresh();

      if (failedCount > 0) {
        setError(
          `Retry + Resolve All finished: ${resolvedCount} resolved, ${failedCount} failed. Failed items remain in Open.`
        );
        return;
      }
      setMessage(`Retry + Resolve All completed: ${resolvedCount} item(s) resolved.`);
    } catch (bulkResolveError) {
      setError(
        bulkResolveError instanceof Error
          ? bulkResolveError.message
          : "Unable to complete Retry + Resolve All."
      );
    } finally {
      setBulkResolving(false);
      setBulkResolveProgress(null);
    }
  }

  async function openJob(jobId: string) {
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/jobs/${encodeURIComponent(jobId)}`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to load job detail.");
      setJobViewer({
        job: (payload?.job ?? null) as Record<string, unknown> | null,
        logs: (payload?.logs ?? []) as Array<Record<string, unknown>>
      });
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : "Unable to load job detail.");
    }
  }

  const latestContactJob = useMemo(() => {
    return data.jobs.find((job) => String(job.sync_scope ?? "") === "contacts") ?? null;
  }, [data.jobs]);
  const syncState = useMemo(
    () => ((data.syncState ?? null) as Record<string, unknown> | null),
    [data.syncState]
  );
  const syncModeStatus = String(syncState?.sync_mode_status ?? "pending_initial_sync");
  const stateProcessed = Number(syncState?.records_processed ?? 0);
  const stateCreated = Number(syncState?.records_created ?? 0);
  const stateUpdated = Number(syncState?.records_updated ?? 0);
  const stateSkipped = Number(syncState?.records_skipped ?? 0);
  const stateFailed = Number(syncState?.records_failed ?? 0);
  const stateTotalRaw = Number(syncState?.total_records_expected ?? 0);
  const stateTotal = Number.isFinite(stateTotalRaw) && stateTotalRaw > 0 ? stateTotalRaw : null;
  const stateRemainingRaw = Number(syncState?.records_remaining ?? 0);
  const stateRemaining =
    Number.isFinite(stateRemainingRaw) && stateRemainingRaw >= 0 ? stateRemainingRaw : null;
  const statePercentRaw = Number(syncState?.percent_complete ?? NaN);
  const statePercent =
    Number.isFinite(statePercentRaw) && statePercentRaw >= 0 && statePercentRaw <= 100
      ? statePercentRaw
      : stateTotal && stateTotal > 0
        ? Math.min(100, Math.max(0, (stateProcessed / stateTotal) * 100))
        : null;
  const stateCurrentPage = Number(syncState?.current_page ?? 0);
  const stateCurrentBatch = Number(syncState?.current_batch ?? 0);
  const stateStatusMessage = String(syncState?.status_message ?? "");
  const stateLastError = String(syncState?.last_error_message ?? "");
  const stateCheckpoint = String(syncState?.last_processed_checkpoint ?? "");
  const stateLastFullSync = String(syncState?.last_successful_full_sync_at ?? "");
  const stateLastIncrementalSync = String(syncState?.last_successful_incremental_sync_at ?? "");
  const stateStartedAt = String(syncState?.started_at ?? "");
  const stateLastUpdatedAt = String(syncState?.last_updated_at ?? "");
  const lastServerResponseAt = String(
    data.overview.lastServerResponseAt ?? data.overview.lastRecordProcessedAt ?? ""
  );
  const stateInProgress =
    syncModeStatus === "full_sync_in_progress" || syncModeStatus === "incremental_sync_in_progress";
  const initialFullSyncComplete = Boolean(syncState?.initial_full_sync_completed);
  const fullSyncInProgress = syncModeStatus === "full_sync_in_progress";
  const incrementalSyncInProgress = syncModeStatus === "incremental_sync_in_progress";
  const syncStateFailed = syncModeStatus === "failed";

  const initialCaptureSynopsis = fullSyncInProgress
    ? "Initial full capture is currently running."
    : initialFullSyncComplete
      ? `Initial full capture completed on ${formatDateTime(stateLastFullSync || null)}.`
      : syncStateFailed
        ? "Initial full capture has not completed successfully yet."
        : "Initial full capture has not run yet.";

  const iterativeSyncSynopsis = !initialFullSyncComplete
    ? "Iterative (incremental) sync is waiting for initial full capture to complete."
    : incrementalSyncInProgress
      ? "Iterative (incremental) sync is running now."
      : stateLastIncrementalSync
        ? `Iterative sync last succeeded on ${formatDateTime(stateLastIncrementalSync || null)}.`
        : "Iterative sync is ready but has not completed a run yet.";

  const serverResponseSynopsis = lastServerResponseAt
    ? `Last successful response from GivingFuel was ${formatDateTime(lastServerResponseAt)}.`
    : "No successful response from GivingFuel has been logged yet.";

  function prettySyncModeStatus(value: string) {
    if (!value) return "Unknown";
    return value.replaceAll("_", " ");
  }
  const openErrors = useMemo(() => {
    return data.errors.filter((row) => String(row.status ?? "").toLowerCase() !== "resolved");
  }, [data.errors]);
  const filteredErrors = useMemo(() => {
    return data.errors.filter((row) => {
      const status = String(row.status ?? "").toLowerCase();
      if (errorStatusFilter === "resolved") return status === "resolved";
      return status !== "resolved";
    });
  }, [data.errors, errorStatusFilter]);

  useEffect(() => {
    void loadSyncedContacts(contactsLimit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationKey, contactsLimit]);

  return (
    <div className="space-y-4">
      {apiPaused ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Integrations API is temporarily disabled in this environment.
        </p>
      ) : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-slate-200 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Integration Name">
            <Input value={String(data.connection.name ?? "GivingFuel Contacts")} disabled />
          </Field>
          <Field label="API Key">
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={apiKeyConfigured ? "******** (already configured)" : "Enter API key"}
              disabled={apiPaused || Boolean(loading)}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={apiPaused || Boolean(loading)}
            onClick={() =>
              void runAction(
                "test",
                () =>
                  fetch(
                    `/api/admin/integrations/${encodeURIComponent(integrationKey)}/test-connection`,
                    {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ apiKey: apiKey || undefined })
                    }
                  ),
                "Test connection completed."
              )
            }
          >
            {loading === "test" ? "Testing..." : "Test Connection"}
          </Button>
          <Button
            type="button"
            disabled={apiPaused || Boolean(loading)}
            onClick={() =>
              void runAction(
                "save",
                () =>
                  fetch(
                    `/api/admin/integrations/${encodeURIComponent(integrationKey)}/configuration`,
                    {
                      method: "PUT",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        apiKey: apiKey || undefined,
                        isEnabled: true,
                        name: "GivingFuel Contacts"
                      })
                    }
                  ),
                "API key saved and integration connected."
              )
            }
          >
            {loading === "save" ? "Saving..." : "Save / Connect"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={apiPaused || Boolean(loading)}
            onClick={() => {
              const confirmed = window.confirm(
                "Run full sync now? This can reprocess all GivingFuel contacts and may take longer than incremental sync."
              );
              if (!confirmed) return;
              void runAction(
                "full-sync",
                () =>
                  fetch(
                    `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/full`,
                    { method: "POST" }
                  ),
                "Full sync completed."
              );
            }}
          >
            {loading === "full-sync" ? "Running..." : "Run Full Sync"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={apiPaused || Boolean(loading)}
            onClick={() =>
              void runAction(
                "incremental-sync",
                () =>
                  fetch(
                    `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/incremental`,
                    { method: "POST" }
                  ),
                "Incremental sync completed."
              )
            }
          >
            {loading === "incremental-sync" ? "Running..." : "Run Incremental Sync"}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={apiPaused || Boolean(loading)}
            onClick={() => {
              const confirmed = window.confirm(
                "Reset sync state? This will require a new full sync before incremental runs."
              );
              if (!confirmed) return;
              void runAction(
                "reset-state",
                () =>
                  fetch(
                    `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/reset-state`,
                    { method: "POST" }
                  ),
                "Sync state reset."
              );
            }}
          >
            {loading === "reset-state" ? "Resetting..." : "Reset Sync State"}
          </Button>
        </div>
      </section>

      <section className="rounded-md border border-blue-200 bg-blue-50 p-4">
        <h4 className="mb-2 text-sm font-semibold text-blue-900">Sync Synopsis</h4>
        <div className="space-y-2 text-sm text-blue-900">
          <p>
            <span className="font-semibold">Initial Capture:</span> {initialCaptureSynopsis}
          </p>
          <p>
            <span className="font-semibold">Iterative Sync:</span> {iterativeSyncSynopsis}
          </p>
          <p>
            <span className="font-semibold">GivingFuel Reachability:</span> {serverResponseSynopsis}
          </p>
          {stateInProgress ? (
            <p>
              <span className="font-semibold">Current Run Heartbeat:</span>{" "}
              {formatDateTime(stateLastUpdatedAt || null)}
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Integration defaults</h4>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <Info label="Method" value="GET" />
          <Info label="Base URL" value="https://api.webconnex.com/v2/public" />
          <Info label="Endpoint" value="/search/customers" />
          <Info label="Header" value="apiKey: <your key>" />
          <Info label="Query Parameter" value="product=givingfuel.com" />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Contacts sync status</h4>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <Info label="Connection Status" value={String(data.overview.connectionStatus ?? "-")} />
          <Info label="Current Status" value={String(data.overview.currentStatus ?? "-")} />
          <Info
            label="Last Server Response from GivingFuel"
            value={formatDateTime(lastServerResponseAt || null)}
          />
          <Info label="Current Sync Mode Status" value={prettySyncModeStatus(syncModeStatus)} />
          <Info
            label="Last Successful Sync"
            value={formatDate(data.overview.lastSuccessfulSync as string | null)}
          />
          <Info
            label="Last Failed Sync"
            value={formatDate(data.overview.lastFailedSync as string | null)}
          />
          <Info
            label="Total CRM Contacts Linked (GivingFuel)"
            value={String(data.overview.totalContactsSynced ?? "0")}
          />
          <Info
            label="Total Source Records Processed"
            value={String(data.overview.totalContactsProcessed ?? "0")}
          />
          <Info
            label="Total Contact Upserts (Created + Updated)"
            value={String(data.overview.totalContactUpsertsSuccessful ?? "0")}
          />
          <Info
            label="Total CRM Contacts"
            value={String(data.overview.totalCrmContacts ?? "0")}
          />
          <Info
            label="Total CRM Personal Contacts"
            value={String(data.overview.totalCrmPersonalContacts ?? "0")}
          />
          <Info
            label="Last Contacts Job Status"
            value={latestContactJob ? String(latestContactJob.status ?? "-") : "Never run"}
          />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Full + Incremental Sync Progress</h4>
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
              <span>{stateStatusMessage || prettySyncModeStatus(syncModeStatus)}</span>
              <span>
                {statePercent !== null ? `${Math.round(statePercent)}%` : stateInProgress ? "Processing..." : "-"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
              {statePercent !== null ? (
                <div className="h-2 rounded bg-brand-600" style={{ width: `${statePercent}%` }} />
              ) : stateInProgress ? (
                <div className="h-2 w-2/5 animate-pulse rounded bg-brand-500" />
              ) : (
                <div className="h-2 rounded bg-slate-300" style={{ width: "0%" }} />
              )}
            </div>
          </div>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <Info label="Sync Mode Status" value={prettySyncModeStatus(syncModeStatus)} />
            <Info
              label="Initial Full Sync Complete"
              value={Boolean(syncState?.initial_full_sync_completed) ? "Yes" : "No"}
            />
            <Info
              label="Records Processed"
              value={
                stateTotal
                  ? `${stateProcessed.toLocaleString()} of ${stateTotal.toLocaleString()}`
                  : `${stateProcessed.toLocaleString()} processed`
              }
            />
            <Info
              label="Records Remaining"
              value={stateRemaining !== null ? stateRemaining.toLocaleString() : "Estimating / unknown"}
            />
            <Info label="Records Created" value={stateCreated.toLocaleString()} />
            <Info label="Records Updated" value={stateUpdated.toLocaleString()} />
            <Info label="Records Skipped" value={stateSkipped.toLocaleString()} />
            <Info label="Records Failed" value={stateFailed.toLocaleString()} />
            <Info label="Current Page" value={stateCurrentPage > 0 ? String(stateCurrentPage) : "-"} />
            <Info label="Current Batch" value={stateCurrentBatch > 0 ? String(stateCurrentBatch) : "-"} />
            <Info label="Last Successful Full Sync" value={formatDate(stateLastFullSync || null)} />
            <Info
              label="Last Successful Incremental Sync"
              value={formatDate(stateLastIncrementalSync || null)}
            />
            <Info label="Last Checkpoint" value={stateCheckpoint || "-"} />
            <Info label="Started At" value={formatDate(stateStartedAt || null)} />
            <Info label="Last Updated At" value={formatDate(stateLastUpdatedAt || null)} />
            <Info label="Last Error" value={stateLastError || "-"} />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("contacts")}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              activeTab === "contacts"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Recently Synced Contacts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("errors")}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              activeTab === "errors"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Error Queue
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              activeTab === "history"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Sync History
          </button>
        </div>

        {activeTab === "contacts" ? (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900">Recently Synced Contacts</h4>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Show
                </label>
                <select
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  value={contactsLimit}
                  onChange={(event) =>
                    setContactsLimit(Number(event.target.value) as 20 | 50 | 100)
                  }
                  disabled={contactsLoading}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void loadSyncedContacts()}
                  disabled={contactsLoading}
                >
                  {contactsLoading ? "Loading..." : "Refresh"}
                </Button>
              </div>
            </div>

            {contactsError ? <p className="mb-2 text-sm text-red-700">{contactsError}</p> : null}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Name</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Phone</th>
                    <th className="py-2">City</th>
                    <th className="py-2">State</th>
                    <th className="py-2">GivingFuel ID</th>
                    <th className="py-2">Source</th>
                    <th className="py-2">Last Synced</th>
                  </tr>
                </thead>
                <tbody>
                  {syncedContacts.map((row) => (
                    <tr
                      key={`${row.externalRecordId}-${row.contact.id}`}
                      className="border-b border-slate-100"
                    >
                      <td className="py-2">
                        {row.contact.id ? (
                          <Link
                            href={`/staff/contacts/${encodeURIComponent(row.contact.id)}`}
                            className="text-blue-700 underline hover:text-blue-900"
                          >
                            {`${row.contact.firstName} ${row.contact.lastName}`.trim() || row.contact.id}
                          </Link>
                        ) : (
                          `${row.contact.firstName} ${row.contact.lastName}`.trim() || "-"
                        )}
                      </td>
                      <td className="py-2">{row.contact.email || "-"}</td>
                      <td className="py-2">{row.contact.phone || "-"}</td>
                      <td className="py-2">{row.contact.city || "-"}</td>
                      <td className="py-2">{row.contact.state || "-"}</td>
                      <td className="py-2">{row.externalRecordId || "-"}</td>
                      <td className="py-2">{row.sourceSystem || "-"}</td>
                      <td className="py-2">{formatDate(row.lastSyncedDate)}</td>
                    </tr>
                  ))}
                  {!contactsLoading && syncedContacts.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={8}>
                        No synced contacts available yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "errors" ? (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900">Error Queue</h4>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </label>
                <select
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  value={errorStatusFilter}
                  onChange={(event) =>
                    setErrorStatusFilter(event.target.value as "open" | "resolved")
                  }
                  disabled={bulkResolving}
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
                {errorStatusFilter === "open" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void resolveAllOpenErrors()}
                    disabled={bulkResolving || openErrors.length === 0}
                  >
                    {bulkResolving ? "Retrying All..." : "Retry + Resolve All Open"}
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Retry + Resolve attempts this specific record again and only resolves it when retry succeeds.
            </p>
            {bulkResolveProgress ? (
              <p className="mb-2 text-xs text-slate-500">
                Resolving {bulkResolveProgress.done} of {bulkResolveProgress.total}...
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Error ID</th>
                    <th className="py-2">Job ID</th>
                    <th className="py-2">Source Record</th>
                    <th className="py-2">Error</th>
                    <th className="py-2">Retry Count</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredErrors.map((row) => (
                    <tr key={String(row.id)} className="border-b border-slate-100">
                      <td className="py-2">{String(row.id ?? "-")}</td>
                      <td className="py-2">{String(row.sync_job_id ?? "-")}</td>
                      <td className="py-2">{String(row.source_record_id ?? "-")}</td>
                      <td className="py-2">{String(row.error_message ?? "-")}</td>
                      <td className="py-2">{String(row.retry_count ?? 0)}</td>
                      <td className="py-2">{String(row.status ?? "-")}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              setPayloadViewer((row.payload_json as Record<string, unknown>) ?? {})
                            }
                          >
                            Open Payload
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void resolveError(String(row.id))}
                            disabled={
                              bulkResolving ||
                              resolvingErrorId === String(row.id) ||
                              String(row.status ?? "").toLowerCase() === "resolved"
                            }
                          >
                            {String(row.status ?? "").toLowerCase() === "resolved"
                              ? "Resolved"
                              : resolvingErrorId === String(row.id)
                                ? "Retrying..."
                                : "Retry + Resolve"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredErrors.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={7}>
                        {errorStatusFilter === "open"
                          ? "No open errors in queue."
                          : "No resolved errors found."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeTab === "history" ? (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Sync History</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Job ID</th>
                    <th className="py-2">Scope</th>
                    <th className="py-2">Started (Date/Time)</th>
                    <th className="py-2">Completed (Date/Time)</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Processed</th>
                    <th className="py-2">Failed</th>
                    <th className="py-2">Error Summary</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((job) => (
                    <tr key={String(job.id)} className="border-b border-slate-100">
                      <td className="py-2">{String(job.id ?? "-")}</td>
                      <td className="py-2">{String(job.sync_scope ?? "-")}</td>
                      <td className="py-2">{formatDateTime(job.started_date as string | null)}</td>
                      <td className="py-2">{formatDateTime(job.completed_date as string | null)}</td>
                      <td className="py-2">{String(job.status ?? "-")}</td>
                      <td className="py-2">{String(job.records_processed ?? 0)}</td>
                      <td className="py-2">{String(job.records_failed ?? 0)}</td>
                      <td className="py-2">{String(job.error_summary ?? "-")}</td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void openJob(String(job.id))}
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {data.jobs.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={9}>
                        No sync jobs found yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {jobViewer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[80vh] w-full max-w-4xl overflow-auto rounded-md bg-white p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Sync Job Detail</h4>
              <Button type="button" variant="secondary" onClick={() => setJobViewer(null)}>
                Close
              </Button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Job: {String(jobViewer.job?.id ?? "-")} | Status:{" "}
              {String(jobViewer.job?.status ?? "-")}
            </p>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">
                {JSON.stringify(jobViewer.logs, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : null}

      {payloadViewer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[80vh] w-full max-w-4xl overflow-auto rounded-md bg-white p-4 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Error Payload</h4>
              <Button type="button" variant="secondary" onClick={() => setPayloadViewer(null)}>
                Close
              </Button>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-700">
                {JSON.stringify(payloadViewer, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}
