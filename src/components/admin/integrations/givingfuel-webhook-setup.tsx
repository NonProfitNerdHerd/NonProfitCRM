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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationKey]);

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
        <strong>How these settings behave:</strong> <em>Enable Integration</em> (top-right on this
        page) controls whether webhook deliveries are processed into review/import workflow. If it is
        disabled, deliveries are still logged in <strong>Webhook Log</strong>. <em>Allow Giving Fuel Module</em>{" "}
        only controls visibility of Data Tools → Giving Fuel for staff users; it does not block webhook
        receipt or webhook logging in Integrations.
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
          <p className="text-sm text-slate-700">
            These thresholds decide when a webhook item is auto-accepted versus routed to manual review.
            Higher confidence values are stricter and will send more items to review.
          </p>
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
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(config.holdAmbiguousDonorMatches ?? true)}
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
                                  holdAmbiguousDonorMatches: event.target.checked
                                }
                              }
                            : null
                        }
                      : prev
                  )
                }
              />
              Hold ambiguous donor matches for manual review
            </label>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p>
              <strong>Rule guidance:</strong>
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong>Auto-Accept Donor Confidence:</strong> minimum donor match confidence needed for
                automatic donor assignment.
              </li>
              <li>
                <strong>Auto-Accept Campaign Confidence:</strong> minimum campaign match confidence needed
                for automatic campaign assignment.
              </li>
              <li>
                <strong>Bulk Donor Threshold:</strong> minimum donor confidence used when bulk-approving
                review rows.
              </li>
              <li>
                <strong>Auto-create unmatched donor:</strong> if no donor match is found, create a new
                donor automatically when other rules allow.
              </li>
              <li>
                <strong>Block low-confidence campaign matches:</strong> prevents uncertain campaign matches
                from auto-import and pushes them to manual review.
              </li>
              <li>
                <strong>Hold ambiguous donor matches:</strong> if multiple likely donors are found, keep the
                item in review instead of auto-selecting one.
              </li>
            </ul>
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

