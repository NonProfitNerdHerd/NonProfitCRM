"use client";

import { ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type DetailPayload = {
  definition: Record<string, unknown>;
  connection: Record<string, unknown>;
  jobs: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  overview: Record<string, unknown>;
};

type TabKey =
  | "overview"
  | "configuration"
  | "sync"
  | "mapping"
  | "history"
  | "errors";

export function WebconnexIntegrationDetail({
  integrationKey,
  initialData,
  initialTab = "overview"
}: {
  integrationKey: string;
  initialData: DetailPayload;
  initialTab?: TabKey;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payloadViewer, setPayloadViewer] = useState<Record<string, unknown> | null>(null);
  const [jobViewer, setJobViewer] = useState<{
    job: Record<string, unknown> | null;
    logs: Array<Record<string, unknown>>;
  } | null>(null);

  const connection = data.connection;
  const syncSettings = (connection.sync_settings_json as Record<string, unknown>) ?? {};
  const configJson = (connection.configuration_json as Record<string, unknown>) ?? {};
  const fieldMapping = (connection.field_mapping_json as Record<string, unknown>) ?? {};

  const [configForm, setConfigForm] = useState({
    name: String(connection.name ?? "Webconnex"),
    baseUrl: String(connection.base_url ?? ""),
    authType: String(connection.auth_type ?? "api_key_header"),
    apiKeyReference: String(connection.api_key_reference ?? ""),
    isEnabled: Boolean(connection.is_enabled ?? false),
    timeoutMs: Number(connection.timeout_ms ?? 30000),
    maxRetries: Number((connection.retry_settings as Record<string, unknown>)?.maxRetries ?? 3),
    backoffMs: Number((connection.retry_settings as Record<string, unknown>)?.backoffMs ?? 1000),
    debugLoggingEnabled: Boolean(connection.debug_logging_enabled ?? false),
    contactsPath: String(configJson.contactsPath ?? "/contacts"),
    transactionsPath: String(configJson.transactionsPath ?? "/transactions"),
    testPath: String(configJson.testPath ?? "/health")
  });

  const [syncForm, setSyncForm] = useState({
    syncMode: String(syncSettings.syncMode ?? "manual_and_scheduled"),
    scheduleFrequency: String(syncSettings.scheduleFrequency ?? "daily"),
    contactSyncEnabled: Boolean(syncSettings.contactSyncEnabled ?? true),
    donationSyncEnabled: Boolean(syncSettings.donationSyncEnabled ?? true),
    fullSyncEnabled: Boolean(syncSettings.fullSyncEnabled ?? true),
    incrementalSyncEnabled: Boolean(syncSettings.incrementalSyncEnabled ?? true),
    fallbackContactMatch: String(syncSettings.fallbackContactMatch ?? "email_if_configured"),
    initialImportStartDate: String(syncSettings.initialImportStartDate ?? "")
  });

  const jobs = useMemo(() => data.jobs ?? [], [data.jobs]);
  const errors = useMemo(() => data.errors ?? [], [data.errors]);

  async function refresh() {
    const response = await fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to refresh details.");
    setData(payload as DetailPayload);
  }

  async function runAction(
    key: string,
    request: () => Promise<Response>,
    successMessage: string
  ) {
    setLoading(key);
    setError(null);
    setMessage(null);
    try {
      const response = await request();
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Action failed.");
      await refresh();
      setMessage(successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setLoading(null);
    }
  }

  async function saveConfiguration() {
    await runAction(
      "save-config",
      () =>
        fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: configForm.name,
            baseUrl: configForm.baseUrl,
            authType: configForm.authType,
            apiKeyReference: configForm.apiKeyReference || undefined,
            isEnabled: configForm.isEnabled,
            timeoutMs: configForm.timeoutMs,
            retrySettings: {
              maxRetries: configForm.maxRetries,
              backoffMs: configForm.backoffMs
            },
            debugLoggingEnabled: configForm.debugLoggingEnabled,
            configuration: {
              contactsPath: configForm.contactsPath,
              transactionsPath: configForm.transactionsPath,
              testPath: configForm.testPath
            }
          })
        }),
      "Configuration saved."
    );
  }

  async function saveSyncSettings() {
    await runAction(
      "save-sync",
      () =>
        fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            syncSettings: {
              ...syncSettings,
              syncMode: syncForm.syncMode,
              scheduleFrequency: syncForm.scheduleFrequency,
              contactSyncEnabled: syncForm.contactSyncEnabled,
              donationSyncEnabled: syncForm.donationSyncEnabled,
              fullSyncEnabled: syncForm.fullSyncEnabled,
              incrementalSyncEnabled: syncForm.incrementalSyncEnabled,
              fallbackContactMatch: syncForm.fallbackContactMatch,
              initialImportStartDate: syncForm.initialImportStartDate || null
            }
          })
        }),
      "Sync settings saved."
    );
  }

  async function openJob(jobId: string) {
    setLoading(`job-${jobId}`);
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
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Tab active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
          Overview
        </Tab>
        <Tab active={activeTab === "configuration"} onClick={() => setActiveTab("configuration")}>
          Configuration
        </Tab>
        <Tab active={activeTab === "sync"} onClick={() => setActiveTab("sync")}>
          Sync Settings
        </Tab>
        <Tab active={activeTab === "mapping"} onClick={() => setActiveTab("mapping")}>
          Field Mapping Summary
        </Tab>
        <Tab active={activeTab === "history"} onClick={() => setActiveTab("history")}>
          Sync History
        </Tab>
        <Tab active={activeTab === "errors"} onClick={() => setActiveTab("errors")}>
          Error Queue
        </Tab>
      </div>

      {activeTab === "overview" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="grid gap-2 md:grid-cols-2">
            <Metric label="Integration name" value={String(data.overview.integrationName ?? "-")} />
            <Metric label="Description" value={String(data.overview.description ?? "-")} />
            <Metric label="Current status" value={String(data.overview.currentStatus ?? "-")} />
            <Metric label="Connection status" value={String(data.overview.connectionStatus ?? "-")} />
            <Metric
              label="Last successful sync"
              value={formatDate(data.overview.lastSuccessfulSync as string | null)}
            />
            <Metric
              label="Last failed sync"
              value={formatDate(data.overview.lastFailedSync as string | null)}
            />
            <Metric
              label="Last sync duration (ms)"
              value={String(data.overview.lastSyncDurationMs ?? "-")}
            />
            <Metric
              label="Total Contacts synced"
              value={String(data.overview.totalContactsSynced ?? "0")}
            />
            <Metric
              label="Total Donations synced"
              value={String(data.overview.totalDonationsSynced ?? "0")}
            />
            <Metric
              label="Failed records count"
              value={String(data.overview.failedRecordsCount ?? "0")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(loading)}
              onClick={() =>
                void runAction(
                  "test",
                  () =>
                    fetch(
                      `/api/admin/integrations/${encodeURIComponent(integrationKey)}/test-connection`,
                      { method: "POST" }
                    ),
                  "Connection test completed."
                )
              }
            >
              {loading === "test" ? "Testing..." : "Test Connection"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(loading)}
              onClick={() =>
                void runAction(
                  "contacts",
                  () =>
                    fetch(
                      `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/contacts`,
                      { method: "POST" }
                    ),
                  "Contact sync completed."
                )
              }
            >
              {loading === "contacts" ? "Syncing..." : "Run Contact Sync"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(loading)}
              onClick={() =>
                void runAction(
                  "donations",
                  () =>
                    fetch(
                      `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/donations`,
                      { method: "POST" }
                    ),
                  "Donation sync completed."
                )
              }
            >
              {loading === "donations" ? "Syncing..." : "Run Donation Sync"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(loading)}
              onClick={() =>
                void runAction(
                  "all",
                  () =>
                    fetch(
                      `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/all`,
                      { method: "POST" }
                    ),
                  "Full sync completed."
                )
              }
            >
              {loading === "all" ? "Syncing..." : "Run Full Sync"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(loading)}
              onClick={() =>
                void runAction(
                  "retry",
                  () =>
                    fetch(
                      `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/retry-failed`,
                      { method: "POST" }
                    ),
                  "Retry failed completed."
                )
              }
            >
              {loading === "retry" ? "Retrying..." : "Retry Failed"}
            </Button>
          </div>
        </section>
      ) : null}

      {activeTab === "configuration" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Integration Name">
              <Input
                value={configForm.name}
                onChange={(event) => setConfigForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </Field>
            <Field label="Base API URL">
              <Input
                value={configForm.baseUrl}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, baseUrl: event.target.value }))
                }
              />
            </Field>
            <Field label="Auth Type">
              <Input
                value={configForm.authType}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, authType: event.target.value }))
                }
              />
            </Field>
            <Field label="API key/secret reference">
              <Input
                value={configForm.apiKeyReference}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, apiKeyReference: event.target.value }))
                }
                placeholder="Env key name only (secret hidden)"
              />
            </Field>
            <Field label="Timeout (ms)">
              <Input
                type="number"
                value={String(configForm.timeoutMs)}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, timeoutMs: Number(event.target.value || 0) }))
                }
              />
            </Field>
            <Field label="Retry max">
              <Input
                type="number"
                value={String(configForm.maxRetries)}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, maxRetries: Number(event.target.value || 0) }))
                }
              />
            </Field>
            <Field label="Retry backoff (ms)">
              <Input
                type="number"
                value={String(configForm.backoffMs)}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, backoffMs: Number(event.target.value || 0) }))
                }
              />
            </Field>
            <Field label="Contacts endpoint">
              <Input
                value={configForm.contactsPath}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, contactsPath: event.target.value }))
                }
              />
            </Field>
            <Field label="Transactions endpoint">
              <Input
                value={configForm.transactionsPath}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, transactionsPath: event.target.value }))
                }
              />
            </Field>
            <Field label="Test endpoint">
              <Input
                value={configForm.testPath}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, testPath: event.target.value }))
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={configForm.isEnabled}
                onChange={(event) =>
                  setConfigForm((prev) => ({ ...prev, isEnabled: event.target.checked }))
                }
              />
              Connection enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={configForm.debugLoggingEnabled}
                onChange={(event) =>
                  setConfigForm((prev) => ({
                    ...prev,
                    debugLoggingEnabled: event.target.checked
                  }))
                }
              />
              Debug logging
            </label>
          </div>
          <Button type="button" onClick={() => void saveConfiguration()} disabled={Boolean(loading)}>
            {loading === "save-config" ? "Saving..." : "Save Configuration"}
          </Button>
        </section>
      ) : null}

      {activeTab === "sync" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Sync mode">
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={syncForm.syncMode}
                onChange={(event) => setSyncForm((prev) => ({ ...prev, syncMode: event.target.value }))}
              >
                <option value="manual_only">Manual only</option>
                <option value="scheduled">Scheduled</option>
                <option value="manual_and_scheduled">Manual + Scheduled</option>
              </select>
            </Field>
            <Field label="Scheduled frequency">
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={syncForm.scheduleFrequency}
                onChange={(event) =>
                  setSyncForm((prev) => ({ ...prev, scheduleFrequency: event.target.value }))
                }
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="custom">Custom cron-style</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={syncForm.contactSyncEnabled}
                onChange={(event) =>
                  setSyncForm((prev) => ({ ...prev, contactSyncEnabled: event.target.checked }))
                }
              />
              Contact sync enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={syncForm.donationSyncEnabled}
                onChange={(event) =>
                  setSyncForm((prev) => ({ ...prev, donationSyncEnabled: event.target.checked }))
                }
              />
              Donation sync enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={syncForm.fullSyncEnabled}
                onChange={(event) =>
                  setSyncForm((prev) => ({ ...prev, fullSyncEnabled: event.target.checked }))
                }
              />
              Full sync enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={syncForm.incrementalSyncEnabled}
                onChange={(event) =>
                  setSyncForm((prev) => ({
                    ...prev,
                    incrementalSyncEnabled: event.target.checked
                  }))
                }
              />
              Incremental sync enabled
            </label>
            <Field label="Fallback matching rules">
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={syncForm.fallbackContactMatch}
                onChange={(event) =>
                  setSyncForm((prev) => ({
                    ...prev,
                    fallbackContactMatch: event.target.value
                  }))
                }
              >
                <option value="none">None</option>
                <option value="email_if_configured">Email fallback (if configured)</option>
              </select>
            </Field>
            <Field label="Initial import date range">
              <Input
                type="date"
                value={syncForm.initialImportStartDate}
                onChange={(event) =>
                  setSyncForm((prev) => ({ ...prev, initialImportStartDate: event.target.value }))
                }
              />
            </Field>
            <Field label="Last successful sync timestamp">
              <Input value={String(syncSettings.lastSuccessfulSyncDate ?? "-")} disabled />
            </Field>
          </div>
          <Button type="button" onClick={() => void saveSyncSettings()} disabled={Boolean(loading)}>
            {loading === "save-sync" ? "Saving..." : "Save Sync Settings"}
          </Button>
        </section>
      ) : null}

      {activeTab === "mapping" ? (
        <section className="space-y-2 rounded-md border border-slate-200 p-4">
          <p className="text-sm text-slate-700">
            Donation relationship rule: donation resolves contact by Webconnex External Contact ID first.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Contacts</p>
              <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(fieldMapping.contacts ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Donations</p>
              <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(fieldMapping.donations ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "history" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2">Job ID</th>
                  <th className="py-2">Job Type</th>
                  <th className="py-2">Scope</th>
                  <th className="py-2">Started</th>
                  <th className="py-2">Completed</th>
                  <th className="py-2">Duration</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Processed</th>
                  <th className="py-2">Created</th>
                  <th className="py-2">Updated</th>
                  <th className="py-2">Failed</th>
                  <th className="py-2">Triggered By</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((row) => (
                  <tr key={String(row.id)} className="border-b border-slate-100">
                    <td className="py-2">{String(row.id ?? "-")}</td>
                    <td className="py-2">{String(row.job_type ?? "-")}</td>
                    <td className="py-2">{String(row.sync_scope ?? "-")}</td>
                    <td className="py-2">{formatDate(row.started_date as string | null)}</td>
                    <td className="py-2">{formatDate(row.completed_date as string | null)}</td>
                    <td className="py-2">{String(row.duration_ms ?? "-")}ms</td>
                    <td className="py-2">{String(row.status ?? "-")}</td>
                    <td className="py-2">{String(row.records_processed ?? 0)}</td>
                    <td className="py-2">{String(row.records_created ?? 0)}</td>
                    <td className="py-2">{String(row.records_updated ?? 0)}</td>
                    <td className="py-2">{String(row.records_failed ?? 0)}</td>
                    <td className="py-2">{String(row.triggered_by ?? "-")}</td>
                    <td className="py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={Boolean(loading)}
                        onClick={() => void openJob(String(row.id))}
                      >
                        {loading === `job-${String(row.id)}` ? "Loading..." : "Open"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={13}>
                      No sync history available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "errors" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <Button
            type="button"
            variant="secondary"
            disabled={Boolean(loading)}
            onClick={() =>
              void runAction(
                "retry-all",
                () =>
                  fetch(
                    `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/retry-failed`,
                    { method: "POST" }
                  ),
                "Retry-all process completed."
              )
            }
          >
            {loading === "retry-all" ? "Retrying..." : "Retry All Retryable"}
          </Button>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2">Error ID</th>
                  <th className="py-2">Job ID</th>
                  <th className="py-2">Entity Type</th>
                  <th className="py-2">Source Record ID</th>
                  <th className="py-2">Error Message</th>
                  <th className="py-2">Retry Count</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Next Retry Date</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((row) => (
                  <tr key={String(row.id)} className="border-b border-slate-100">
                    <td className="py-2">{String(row.id ?? "-")}</td>
                    <td className="py-2">{String(row.sync_job_id ?? "-")}</td>
                    <td className="py-2">{String(row.entity_type ?? "-")}</td>
                    <td className="py-2">{String(row.source_record_id ?? "-")}</td>
                    <td className="py-2">{String(row.error_message ?? "-")}</td>
                    <td className="py-2">{String(row.retry_count ?? 0)}</td>
                    <td className="py-2">{String(row.status ?? "-")}</td>
                    <td className="py-2">{formatDate(row.next_retry_date as string | null)}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            setPayloadViewer((row.payload_json as Record<string, unknown>) ?? {})
                          }
                        >
                          Open Raw Payload
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={Boolean(loading)}
                          onClick={() =>
                            void runAction(
                              `resolve-${String(row.id)}`,
                              () =>
                                fetch(
                                  `/api/admin/integrations/${encodeURIComponent(integrationKey)}/errors/${encodeURIComponent(String(row.id))}/resolve`,
                                  { method: "POST" }
                                ),
                              "Error marked resolved."
                            )
                          }
                        >
                          {loading === `resolve-${String(row.id)}` ? "Saving..." : "Mark Resolved"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {errors.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={9}>
                      Error queue is empty.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {jobViewer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[80vh] w-full max-w-5xl overflow-auto rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Sync Job Detail</h4>
              <Button type="button" variant="ghost" onClick={() => setJobViewer(null)}>
                Close
              </Button>
            </div>
            <pre className="mb-3 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(jobViewer.job, null, 2)}
            </pre>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Job Logs
            </p>
            <pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(jobViewer.logs, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}

      {payloadViewer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Error Payload</h4>
              <Button type="button" variant="ghost" onClick={() => setPayloadViewer(null)}>
                Close
              </Button>
            </div>
            <pre className="overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(payloadViewer, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm ${
        active
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
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
