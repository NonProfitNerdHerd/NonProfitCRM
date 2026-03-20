"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DetailPayload = {
  definition: Record<string, unknown>;
  connection: Record<string, unknown>;
  jobs: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  overview: Record<string, unknown>;
  apiPaused?: boolean;
};

type AdminConfigurationPayload = {
  connection: {
    id: string;
    isEnabled: boolean;
    allowModuleAccess: boolean;
    configuration: Record<string, unknown>;
    syncSettings: Record<string, unknown>;
  } | null;
};

type WebhookLogPayload = {
  rows: Array<{
    id: string;
    received_at: string | null;
    processed_at: string | null;
    provider_event_id: string | null;
    event_type: string | null;
    processing_status: string | null;
    error_message: string | null;
    created_transaction_id: string | null;
  }>;
};

export function GivingFuelWebhookSetup({
  integrationKey
}: {
  integrationKey: string;
  initialData: DetailPayload;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [configuration, setConfiguration] = useState<AdminConfigurationPayload | null>(null);
  const [activeTab, setActiveTab] = useState<"connection" | "matching" | "mapping">("connection");
  const [webhookLog, setWebhookLog] = useState<WebhookLogPayload>({ rows: [] });
  const [logLimit, setLogLimit] = useState(10);
  const [loadingLog, setLoadingLog] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState("");

  const connection = configuration?.connection ?? null;
  const config = connection?.configuration ?? {};

  const webhookUrl = useMemo(() => {
    if (!connection?.id) return "";
    if (typeof window === "undefined") return `/api/integrations/givingfuel/webhook/${connection.id}`;
    return `${window.location.origin}/api/integrations/givingfuel/webhook/${connection.id}`;
  }, [connection?.id]);

  async function loadConfiguration() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/webhook/configuration`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Failed to load GivingFuel webhook configuration.");
      }
      setConfiguration(payload as AdminConfigurationPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load configuration.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfiguration();
    void loadWebhookLog(10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationKey]);

  async function loadWebhookLog(limit = logLimit) {
    setLoadingLog(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/webhook/log?limit=${encodeURIComponent(String(limit))}`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Failed to load webhook log.");
      }
      setWebhookLog(payload as WebhookLogPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load webhook log.");
    } finally {
      setLoadingLog(false);
    }
  }

  async function saveConfiguration() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/webhook/configuration`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            isEnabled: connection?.isEnabled ?? false,
            allowModuleAccess: connection?.allowModuleAccess ?? false,
            webhookSecret: webhookSecret || undefined,
            settings: {
              autoAcceptDonorConfidence: Number(config.autoAcceptDonorConfidence ?? 95),
              autoAcceptCampaignConfidence: Number(config.autoAcceptCampaignConfidence ?? 100),
              autoCreateUnmatchedDonor: Boolean(config.autoCreateUnmatchedDonor),
              blockLowConfidenceCampaign: Boolean(config.blockLowConfidenceCampaign ?? true),
              holdAmbiguousDonorMatches: Boolean(config.holdAmbiguousDonorMatches ?? true),
              bulkApprovalDonorConfidenceThreshold: Number(
                config.bulkApprovalDonorConfidenceThreshold ?? 98
              ),
              bulkApprovalCampaignConfidenceThreshold: Number(
                config.bulkApprovalCampaignConfidenceThreshold ?? 100
              )
            }
          })
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Failed to save configuration.");
      setWebhookSecret("");
      setMessage("GivingFuel webhook configuration saved.");
      await loadConfiguration();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Loading GivingFuel webhook configuration...</p>;
  }

  if (!connection) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        GivingFuel Webhook connection is not available in this environment yet.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <strong>Important:</strong> <em>Enable Integration</em> controls webhook processing.{" "}
        <em>Allow Giving Fuel Module</em> controls whether users can see Data Tools → Giving Fuel.
        These settings are intentionally separate.
      </p>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <Button
          type="button"
          variant={activeTab === "connection" ? "primary" : "secondary"}
          onClick={() => setActiveTab("connection")}
        >
          Webhook Connection
        </Button>
        <Button
          type="button"
          variant={activeTab === "matching" ? "primary" : "secondary"}
          onClick={() => setActiveTab("matching")}
        >
          Matching & Review Rules
        </Button>
        <Button
          type="button"
          variant={activeTab === "mapping" ? "primary" : "secondary"}
          onClick={() => setActiveTab("mapping")}
        >
          Campaign Mapping Location
        </Button>
      </div>

      {activeTab === "connection" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Webhook Connection</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(connection.allowModuleAccess)}
                onChange={(event) =>
                  setConfiguration((prev) =>
                    prev
                      ? {
                          ...prev,
                          connection: prev.connection
                            ? { ...prev.connection, allowModuleAccess: event.target.checked }
                            : null
                        }
                      : prev
                  )
                }
              />
              Allow Giving Fuel Module (Data Tools visibility)
            </label>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Webhook URL</label>
            <Input value={webhookUrl} readOnly />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Webhook Secret</label>
            <Input
              type="password"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              placeholder={
                config.webhookSecretConfigured
                  ? "******** (already configured, enter to rotate)"
                  : "Enter webhook secret"
              }
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => void saveConfiguration()} disabled={saving}>
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </section>
      ) : null}

      {activeTab === "matching" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Matching & Review Rules</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <Field
              label="Auto-Accept Donor Confidence"
              value={Number(config.autoAcceptDonorConfidence ?? 95)}
              onChange={(value) =>
                setConfiguration((prev) =>
                  prev
                    ? {
                        ...prev,
                        connection: prev.connection
                          ? {
                              ...prev.connection,
                              configuration: {
                                ...prev.connection.configuration,
                                autoAcceptDonorConfidence: value
                              }
                            }
                          : null
                      }
                    : prev
                )
              }
            />
            <Field
              label="Auto-Accept Campaign Confidence"
              value={Number(config.autoAcceptCampaignConfidence ?? 100)}
              onChange={(value) =>
                setConfiguration((prev) =>
                  prev
                    ? {
                        ...prev,
                        connection: prev.connection
                          ? {
                              ...prev.connection,
                              configuration: {
                                ...prev.connection.configuration,
                                autoAcceptCampaignConfidence: value
                              }
                            }
                          : null
                      }
                    : prev
                )
              }
            />
            <Field
              label="Bulk Donor Threshold"
              value={Number(config.bulkApprovalDonorConfidenceThreshold ?? 98)}
              onChange={(value) =>
                setConfiguration((prev) =>
                  prev
                    ? {
                        ...prev,
                        connection: prev.connection
                          ? {
                              ...prev.connection,
                              configuration: {
                                ...prev.connection.configuration,
                                bulkApprovalDonorConfidenceThreshold: value
                              }
                            }
                          : null
                      }
                    : prev
                )
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(config.autoCreateUnmatchedDonor)}
                onChange={(event) =>
                  setConfiguration((prev) =>
                    prev
                      ? {
                          ...prev,
                          connection: prev.connection
                            ? {
                                ...prev.connection,
                                configuration: {
                                  ...prev.connection.configuration,
                                  autoCreateUnmatchedDonor: event.target.checked
                                }
                              }
                            : null
                        }
                      : prev
                  )
                }
              />
              Auto-create unmatched donor
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(config.blockLowConfidenceCampaign ?? true)}
                onChange={(event) =>
                  setConfiguration((prev) =>
                    prev
                      ? {
                          ...prev,
                          connection: prev.connection
                            ? {
                                ...prev.connection,
                                configuration: {
                                  ...prev.connection.configuration,
                                  blockLowConfidenceCampaign: event.target.checked
                                }
                              }
                            : null
                        }
                      : prev
                  )
                }
              />
              Block low-confidence campaign matches into review
            </label>
          </div>
        </section>
      ) : null}

      {activeTab === "mapping" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Campaign Mapping Location</h4>
          <p className="text-sm text-slate-700">
            Page-to-campaign mapping is managed in{" "}
            <Link className="text-blue-700 underline" href="/staff/data-tools/giving-fuel">
              Data Tools → Giving Fuel
            </Link>{" "}
            under the <strong>Campaign Configuration</strong> tab.
          </p>
        </section>
      ) : null}

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900">Webhook Log</h4>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-700" htmlFor="webhook-log-limit">
              Show
            </label>
            <select
              id="webhook-log-limit"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={logLimit}
              onChange={(event) => {
                const next = Number(event.target.value);
                setLogLimit(next);
                void loadWebhookLog(next);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
            <Button type="button" variant="secondary" onClick={() => void loadWebhookLog()} disabled={loadingLog}>
              {loadingLog ? "Refreshing..." : "Refresh Log"}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Received</th>
                <th className="py-2">Provider Event ID</th>
                <th className="py-2">Event Type</th>
                <th className="py-2">Status</th>
                <th className="py-2">Processed</th>
                <th className="py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {webhookLog.rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2">{formatDateTime(row.received_at)}</td>
                  <td className="py-2">{row.provider_event_id || "-"}</td>
                  <td className="py-2">{row.event_type || "-"}</td>
                  <td className="py-2">{row.processing_status || "-"}</td>
                  <td className="py-2">{formatDateTime(row.processed_at)}</td>
                  <td className="py-2">{row.error_message || "-"}</td>
                </tr>
              ))}
              {webhookLog.rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={6}>
                    No webhook attempts logged yet.
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

function Field({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">{label}</label>
      <Input
        type="number"
        min={0}
        max={100}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}
