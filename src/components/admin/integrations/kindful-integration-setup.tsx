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

type QueueItem = {
  id: string;
  entityType: string;
  sourceRecordId: string | null;
  reason?: string;
  confidenceScore?: number | null;
  resolutionStatus?: string;
  errorMessage?: string;
  retryCount?: number;
  status?: string;
  createdAt: string;
};

type CutoverPayload = {
  contactsImported: number;
  transactionsImported: number;
  openFailedQueue: number;
  openReviewQueue: number;
  lastKindfulOnlyChangeAt: string | null;
  daysSinceLastKindfulChange: number | null;
  quietDaysTarget: number;
  readyToCutover: boolean;
  latestReport?: Record<string, unknown> | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function KindfulIntegrationSetup({
  integrationKey,
  initialData
}: {
  integrationKey: string;
  initialData: DetailPayload;
}) {
  const [data, setData] = useState(initialData);
  const [apiToken, setApiToken] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewRows, setReviewRows] = useState<QueueItem[]>([]);
  const [deadLetterRows, setDeadLetterRows] = useState<QueueItem[]>([]);
  const [cutover, setCutover] = useState<CutoverPayload | null>(null);
  const [activeTab, setActiveTab] = useState<
    "settings" | "migration" | "ongoing" | "queues" | "cutover"
  >("settings");
  const [quietDays, setQuietDays] = useState(7);
  const [cutoverNotes, setCutoverNotes] = useState("");

  const apiPaused = Boolean(data.apiPaused);
  const config = (data.connection.configuration_json as Record<string, unknown>) ?? {};
  const syncSettings = (data.connection.sync_settings_json as Record<string, unknown>) ?? {};
  const apiKeyConfigured = Boolean(config.apiKeyConfigured);

  const [settingsForm, setSettingsForm] = useState({
    baseUrl: String(data.connection.base_url ?? "https://app.kindful.com"),
    environment: String(config.environment ?? "production"),
    pageSize: toNumber(config.pageSize, 50),
    requestIntervalMs: toNumber(config.requestIntervalMs, 200),
    isEnabled: Boolean(data.connection.is_enabled ?? false)
  });

  async function refreshDetail() {
    const response = await fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}`, {
      cache: "no-store"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to refresh integration detail.");
    }
    setData(payload as DetailPayload);
  }

  async function refreshQueues() {
    const [reviewResponse, deadLetterResponse] = await Promise.all([
      fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/kindful/review-queue?status=open`,
        {
          cache: "no-store"
        }
      ),
      fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/kindful/dead-letter?status=open`,
        {
          cache: "no-store"
        }
      )
    ]);
    const reviewPayload = await reviewResponse.json().catch(() => null);
    const deadLetterPayload = await deadLetterResponse.json().catch(() => null);
    if (!reviewResponse.ok) {
      throw new Error(reviewPayload?.message ?? "Unable to load review queue.");
    }
    if (!deadLetterResponse.ok) {
      throw new Error(deadLetterPayload?.message ?? "Unable to load dead-letter queue.");
    }
    setReviewRows(Array.isArray(reviewPayload?.rows) ? (reviewPayload.rows as QueueItem[]) : []);
    setDeadLetterRows(
      Array.isArray(deadLetterPayload?.rows) ? (deadLetterPayload.rows as QueueItem[]) : []
    );
  }

  async function refreshCutover() {
    const response = await fetch(
      `/api/admin/integrations/${encodeURIComponent(integrationKey)}/kindful/cutover?quietDays=${String(quietDays)}`,
      { cache: "no-store" }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to load cutover readiness.");
    }
    setCutover(payload as CutoverPayload);
  }

  async function runAction(
    key: string,
    request: () => Promise<Response>,
    successMessage: string,
    refreshMode: "all" | "detail" | "queues" | "cutover" = "all"
  ) {
    setLoading(key);
    setMessage(null);
    setError(null);
    try {
      const response = await request();
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Request failed.");
      }
      if (refreshMode === "all" || refreshMode === "detail") await refreshDetail();
      if (refreshMode === "all" || refreshMode === "queues") await refreshQueues();
      if (refreshMode === "all" || refreshMode === "cutover") await refreshCutover();
      setMessage(payload?.message ?? successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Request failed.");
    } finally {
      setLoading(null);
    }
  }

  async function saveSettings() {
    await runAction(
      "save-settings",
      () =>
        fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}/configuration`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            baseUrl: settingsForm.baseUrl,
            isEnabled: settingsForm.isEnabled,
            apiKey: apiToken || undefined,
            configuration: {
              environment: settingsForm.environment,
              pageSize: settingsForm.pageSize,
              requestIntervalMs: settingsForm.requestIntervalMs
            },
            syncSettings: {
              ...(syncSettings ?? {}),
              scheduleFrequency: syncSettings.scheduleFrequency ?? "hourly",
              contactSyncEnabled: true,
              donationSyncEnabled: true
            }
          })
        }),
      "Kindful settings saved.",
      "detail"
    );
    setApiToken("");
  }

  async function runBackfill(scope: "contacts" | "donations" | "all") {
    const modePatch =
      scope === "contacts"
        ? { kindfulContactsMode: "backfill" }
        : scope === "donations"
          ? { kindfulTransactionsMode: "backfill" }
          : { kindfulContactsMode: "backfill", kindfulTransactionsMode: "backfill" };
    await runAction(
      `backfill-${scope}`,
      async () => {
        await fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}/configuration`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            syncSettings: {
              ...(syncSettings ?? {}),
              ...modePatch
            }
          })
        });
        return fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/${scope}`, {
          method: "POST"
        });
      },
      `Kindful ${scope} backfill started.`,
      "all"
    );
  }

  async function runIncremental(scope: "contacts" | "donations" | "all") {
    const modePatch =
      scope === "contacts"
        ? { kindfulContactsMode: "incremental" }
        : scope === "donations"
          ? { kindfulTransactionsMode: "incremental" }
          : { kindfulContactsMode: "incremental", kindfulTransactionsMode: "incremental" };
    await runAction(
      `incremental-${scope}`,
      async () => {
        await fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}/configuration`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            syncSettings: {
              ...(syncSettings ?? {}),
              ...modePatch
            }
          })
        });
        return fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/${scope}`, {
          method: "POST"
        });
      },
      `Kindful ${scope} incremental sync started.`,
      "all"
    );
  }

  useEffect(() => {
    setSettingsForm({
      baseUrl: String(data.connection.base_url ?? "https://app.kindful.com"),
      environment: String(config.environment ?? "production"),
      pageSize: toNumber(config.pageSize, 50),
      requestIntervalMs: toNumber(config.requestIntervalMs, 200),
      isEnabled: Boolean(data.connection.is_enabled ?? false)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.connection.id]);

  useEffect(() => {
    void refreshQueues().catch(() => undefined);
    void refreshCutover().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationKey, quietDays]);

  const latestJob = useMemo(() => data.jobs[0] ?? null, [data.jobs]);
  const contactsSummary = useMemo(
    () => (syncSettings.kindfulLastContactsSummary as Record<string, unknown> | undefined) ?? {},
    [syncSettings]
  );
  const transactionsSummary = useMemo(
    () =>
      (syncSettings.kindfulLastTransactionsSummary as Record<string, unknown> | undefined) ?? {},
    [syncSettings]
  );

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {apiPaused ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Integrations API is paused in this environment.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {[
          ["settings", "Integration Settings"],
          ["migration", "Initial Migration"],
          ["ongoing", "Ongoing Sync"],
          ["queues", "Error / Review Queue"],
          ["cutover", "Cutover Readiness"]
        ].map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={activeTab === key ? "primary" : "secondary"}
            onClick={() =>
              setActiveTab(key as "settings" | "migration" | "ongoing" | "queues" | "cutover")
            }
          >
            {label}
          </Button>
        ))}
      </div>

      {activeTab === "settings" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Kindful Base URL">
              <Input
                value={settingsForm.baseUrl}
                onChange={(event) =>
                  setSettingsForm((prev) => ({ ...prev, baseUrl: event.target.value }))
                }
              />
            </Field>
            <Field label="Application Token">
              <Input
                type="password"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder={apiKeyConfigured ? "******** (already configured)" : "Enter token"}
              />
            </Field>
            <Field label="Environment">
              <Input
                value={settingsForm.environment}
                onChange={(event) =>
                  setSettingsForm((prev) => ({ ...prev, environment: event.target.value }))
                }
              />
            </Field>
            <Field label="Page Size (max 50)">
              <Input
                type="number"
                value={String(settingsForm.pageSize)}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    pageSize: Math.max(1, Math.min(Number(event.target.value || 1), 50))
                  }))
                }
              />
            </Field>
            <Field label="Polling / request interval (ms)">
              <Input
                type="number"
                value={String(settingsForm.requestIntervalMs)}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    requestIntervalMs: Math.max(0, Number(event.target.value || 0))
                  }))
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settingsForm.isEnabled}
                onChange={(event) =>
                  setSettingsForm((prev) => ({ ...prev, isEnabled: event.target.checked }))
                }
              />
              Integration enabled
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void saveSettings()} disabled={Boolean(loading)}>
              {loading === "save-settings" ? "Saving..." : "Save Settings"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void runAction(
                  "test-connection",
                  () =>
                    fetch(
                      `/api/admin/integrations/${encodeURIComponent(integrationKey)}/test-connection`,
                      {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ apiKey: apiToken || undefined })
                      }
                    ),
                  "Kindful connection test completed.",
                  "detail"
                )
              }
              disabled={Boolean(loading)}
            >
              {loading === "test-connection" ? "Testing..." : "Test Connection"}
            </Button>
          </div>
        </section>
      ) : null}

      {activeTab === "migration" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            <Metric
              label="Contacts Imported"
              value={String(cutover?.contactsImported ?? data.overview.totalContactsSynced ?? 0)}
            />
            <Metric
              label="Transactions Imported"
              value={String(cutover?.transactionsImported ?? data.overview.totalDonationsSynced ?? 0)}
            />
            <Metric
              label="Last Migration Job"
              value={latestJob ? formatDateTime(String(latestJob.started_date ?? null)) : "Never run"}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryCard title="Contacts Backfill">
              <p>Pages: {String(contactsSummary.pagesProcessed ?? 0)}</p>
              <p>Processed: {String(contactsSummary.processed ?? 0)}</p>
              <p>Created: {String(contactsSummary.created ?? 0)}</p>
              <p>Updated: {String(contactsSummary.updated ?? 0)}</p>
              <p>Failed: {String(contactsSummary.failed ?? 0)}</p>
            </SummaryCard>
            <SummaryCard title="Transactions Backfill">
              <p>Pages: {String(transactionsSummary.pagesProcessed ?? 0)}</p>
              <p>Processed: {String(transactionsSummary.processed ?? 0)}</p>
              <p>Created: {String(transactionsSummary.created ?? 0)}</p>
              <p>Updated: {String(transactionsSummary.updated ?? 0)}</p>
              <p>Failed: {String(transactionsSummary.failed ?? 0)}</p>
            </SummaryCard>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void runBackfill("contacts")} disabled={Boolean(loading)}>
              {loading === "backfill-contacts" ? "Running..." : "Run Full Contact Backfill"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void runBackfill("donations")}
              disabled={Boolean(loading)}
            >
              {loading === "backfill-donations" ? "Running..." : "Run Full Transaction Backfill"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void runBackfill("all")}
              disabled={Boolean(loading)}
            >
              {loading === "backfill-all" ? "Running..." : "Run Full Migration (All)"}
            </Button>
          </div>
        </section>
      ) : null}

      {activeTab === "ongoing" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            <Metric label="Connection Status" value={String(data.overview.connectionStatus ?? "-")} />
            <Metric
              label="Last Successful Sync"
              value={formatDateTime(String(data.overview.lastSuccessfulSync ?? null))}
            />
            <Metric
              label="Next Scheduled Window"
              value={`~${String(syncSettings.scheduleFrequency ?? "hourly")}`}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <Metric label="Retrieved" value={String(latestJob?.records_retrieved ?? 0)} />
            <Metric label="Processed" value={String(latestJob?.records_processed ?? 0)} />
            <Metric label="Created" value={String(latestJob?.records_created ?? 0)} />
            <Metric label="Updated" value={String(latestJob?.records_updated ?? 0)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void runIncremental("contacts")}
              disabled={Boolean(loading)}
            >
              {loading === "incremental-contacts" ? "Running..." : "Run Incremental Contact Sync"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void runIncremental("donations")}
              disabled={Boolean(loading)}
            >
              {loading === "incremental-donations" ? "Running..." : "Run Incremental Transaction Sync"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void runIncremental("all")}
              disabled={Boolean(loading)}
            >
              {loading === "incremental-all" ? "Running..." : "Run Incremental Sync (All)"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void runAction(
                  "retry-failed",
                  () =>
                    fetch(
                      `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/retry-failed`,
                      { method: "POST" }
                    ),
                  "Replay of failed records triggered.",
                  "all"
                )
              }
              disabled={Boolean(loading)}
            >
              {loading === "retry-failed" ? "Running..." : "Manual Replay Failed Records"}
            </Button>
          </div>
        </section>
      ) : null}

      {activeTab === "queues" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Duplicate / Review Queue</h4>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void refreshQueues()}
                disabled={Boolean(loading)}
              >
                Refresh
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Review ID</th>
                    <th className="py-2">Entity</th>
                    <th className="py-2">Reason</th>
                    <th className="py-2">Confidence</th>
                    <th className="py-2">Created</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-2">{row.id}</td>
                      <td className="py-2">{row.entityType}</td>
                      <td className="py-2">{row.reason || "-"}</td>
                      <td className="py-2">
                        {typeof row.confidenceScore === "number" ? row.confidenceScore.toFixed(2) : "-"}
                      </td>
                      <td className="py-2">{formatDate(row.createdAt)}</td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            void runAction(
                              `resolve-review-${row.id}`,
                              () =>
                                fetch(
                                  `/api/admin/integrations/${encodeURIComponent(integrationKey)}/kindful/review-queue/${encodeURIComponent(row.id)}/resolve`,
                                  { method: "POST" }
                                ),
                              "Review queue item resolved.",
                              "queues"
                            )
                          }
                          disabled={Boolean(loading)}
                        >
                          {loading === `resolve-review-${row.id}` ? "Resolving..." : "Resolve"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {reviewRows.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={6}>
                        No open review queue items.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Dead-Letter Queue</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Dead Letter ID</th>
                    <th className="py-2">Entity</th>
                    <th className="py-2">Error</th>
                    <th className="py-2">Retries</th>
                    <th className="py-2">Created</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deadLetterRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-2">{row.id}</td>
                      <td className="py-2">{row.entityType}</td>
                      <td className="py-2">{row.errorMessage || "-"}</td>
                      <td className="py-2">{String(row.retryCount ?? 0)}</td>
                      <td className="py-2">{formatDate(row.createdAt)}</td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            void runAction(
                              `replay-dead-letter-${row.id}`,
                              () =>
                                fetch(
                                  `/api/admin/integrations/${encodeURIComponent(integrationKey)}/kindful/dead-letter/${encodeURIComponent(row.id)}/replay`,
                                  { method: "POST" }
                                ),
                              "Dead-letter replay triggered.",
                              "all"
                            )
                          }
                          disabled={Boolean(loading)}
                        >
                          {loading === `replay-dead-letter-${row.id}` ? "Replaying..." : "Replay"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {deadLetterRows.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={6}>
                        No open dead-letter queue items.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "cutover" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            <Metric label="Contacts Imported" value={String(cutover?.contactsImported ?? 0)} />
            <Metric label="Transactions Imported" value={String(cutover?.transactionsImported ?? 0)} />
            <Metric label="Open Failed Queue" value={String(cutover?.openFailedQueue ?? 0)} />
            <Metric label="Open Review Queue" value={String(cutover?.openReviewQueue ?? 0)} />
            <Metric
              label="Last Kindful-Only Change"
              value={formatDateTime(cutover?.lastKindfulOnlyChangeAt ?? null)}
            />
            <Metric
              label="Days Since Last Change"
              value={
                cutover?.daysSinceLastKindfulChange === null
                  ? "-"
                  : String(cutover?.daysSinceLastKindfulChange ?? 0)
              }
            />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-900">
              Cutover Ready: {cutover?.readyToCutover ? "Yes" : "No"}
            </p>
            <p className="text-xs text-slate-600">
              Quiet period target: {String(cutover?.quietDaysTarget ?? quietDays)} day(s)
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Quiet days target">
              <Input
                type="number"
                value={String(quietDays)}
                onChange={(event) => setQuietDays(Math.max(1, Number(event.target.value || 1)))}
              />
            </Field>
            <Field label="Approval notes">
              <Input
                value={cutoverNotes}
                onChange={(event) => setCutoverNotes(event.target.value)}
                placeholder="Optional cutover notes"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refreshCutover()}
              disabled={Boolean(loading)}
            >
              Refresh Readiness
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() =>
                void runAction(
                  "approve-cutover",
                  () =>
                    fetch(
                      `/api/admin/integrations/${encodeURIComponent(integrationKey)}/kindful/cutover`,
                      {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          notes: cutoverNotes || undefined,
                          quietDays
                        })
                      }
                    ),
                  "Kindful cutover approved. Integration has been frozen.",
                  "all"
                )
              }
              disabled={Boolean(loading) || !cutover?.readyToCutover}
            >
              {loading === "approve-cutover" ? "Approving..." : "Approve Cutover + Freeze Sync"}
            </Button>
          </div>
        </section>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
      <p className="mb-2 text-sm font-semibold text-slate-900">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
