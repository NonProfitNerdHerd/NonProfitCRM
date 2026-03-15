"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type DetailPayload = {
  definition: Record<string, unknown>;
  connection: Record<string, unknown>;
  jobs: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  overview: Record<string, unknown>;
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
  const [loading, setLoading] = useState<"test" | "save" | "sync" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contactsLimit, setContactsLimit] = useState<20 | 50 | 100>(20);
  const [syncedContacts, setSyncedContacts] = useState<SyncedContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [resolvingErrorId, setResolvingErrorId] = useState<string | null>(null);
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
    action: "test" | "save" | "sync",
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
      setMessage("Error marked resolved.");
    } catch (resolveErrorValue) {
      setError(resolveErrorValue instanceof Error ? resolveErrorValue.message : "Unable to resolve error.");
    } finally {
      setResolvingErrorId(null);
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
            onClick={() =>
              void runAction(
                "sync",
                () =>
                  fetch(
                    `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/contacts`,
                    { method: "POST" }
                  ),
                "Contacts sync completed."
              )
            }
          >
            {loading === "sync" ? "Syncing..." : "Run Contacts Sync"}
          </Button>
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
            label="Last Successful Sync"
            value={formatDate(data.overview.lastSuccessfulSync as string | null)}
          />
          <Info
            label="Last Failed Sync"
            value={formatDate(data.overview.lastFailedSync as string | null)}
          />
          <Info
            label="Total Contacts Synced"
            value={String(data.overview.totalContactsSynced ?? "0")}
          />
          <Info
            label="Last Contacts Job Status"
            value={latestContactJob ? String(latestContactJob.status ?? "-") : "Never run"}
          />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Sync History</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Job ID</th>
                <th className="py-2">Scope</th>
                <th className="py-2">Started</th>
                <th className="py-2">Completed</th>
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
                  <td className="py-2">{formatDate(job.started_date as string | null)}</td>
                  <td className="py-2">{formatDate(job.completed_date as string | null)}</td>
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
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h4 className="mb-2 text-sm font-semibold text-slate-900">Error Queue</h4>
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
              {data.errors.map((row) => (
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
                        disabled={resolvingErrorId === String(row.id)}
                      >
                        {resolvingErrorId === String(row.id) ? "Saving..." : "Mark Resolved"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.errors.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={7}>
                    No unresolved errors in queue.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
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
                <tr key={`${row.externalRecordId}-${row.contact.id}`} className="border-b border-slate-100">
                  <td className="py-2">
                    {`${row.contact.firstName} ${row.contact.lastName}`.trim() || "-"}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}
