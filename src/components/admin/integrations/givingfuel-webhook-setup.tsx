"use client";

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
  const [webhookSecret, setWebhookSecret] = useState("");
  const [mappingDraft, setMappingDraft] = useState({
    externalPageId: "",
    externalPageKey: "",
    externalPageName: "",
    crmCampaignId: "",
    isActive: true,
    notes: ""
  });

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

  async function saveMapping() {
    if (!mappingDraft.externalPageId.trim() || !mappingDraft.crmCampaignId.trim()) {
      setError("External Page ID and CRM Campaign are required.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/webhook/mappings`,
        {
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
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Failed to save campaign mapping.");
      setMappingDraft({
        externalPageId: "",
        externalPageKey: "",
        externalPageName: "",
        crmCampaignId: "",
        isActive: true,
        notes: ""
      });
      setMessage("Campaign mapping saved.");
      await loadConfiguration();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMapping(mappingId: string) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/webhook/mappings/${encodeURIComponent(mappingId)}`,
        { method: "DELETE" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Failed to delete mapping.");
      setMessage("Campaign mapping deleted.");
      await loadConfiguration();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete mapping.");
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
  const safeConfiguration = configuration as AdminConfigurationPayload;

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <strong>Important:</strong> <em>Enable Integration</em> controls webhook processing.{" "}
        <em>Allow Giving Fuel Module</em> controls whether users can see Data Tools → Giving Fuel.
        These settings are intentionally separate.
      </p>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-900">Webhook Connection</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(connection.isEnabled)}
              onChange={(event) =>
                setConfiguration((prev) =>
                  prev
                    ? {
                        ...prev,
                        connection: prev.connection
                          ? { ...prev.connection, isEnabled: event.target.checked }
                          : null
                      }
                    : prev
                )
              }
            />
            Enable Integration (process webhook deliveries)
          </label>
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
      </section>

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

      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-900">GivingFuel Page → CRM Campaign Mapping</h4>
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            value={mappingDraft.externalPageId}
            onChange={(event) =>
              setMappingDraft((prev) => ({ ...prev, externalPageId: event.target.value }))
            }
            placeholder="External Page ID *"
          />
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={mappingDraft.crmCampaignId}
            onChange={(event) =>
              setMappingDraft((prev) => ({ ...prev, crmCampaignId: event.target.value }))
            }
          >
            <option value="">Select CRM Campaign *</option>
            {safeConfiguration.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          <Input
            value={mappingDraft.externalPageKey}
            onChange={(event) =>
              setMappingDraft((prev) => ({ ...prev, externalPageKey: event.target.value }))
            }
            placeholder="External Page Key (optional)"
          />
          <Input
            value={mappingDraft.externalPageName}
            onChange={(event) =>
              setMappingDraft((prev) => ({ ...prev, externalPageName: event.target.value }))
            }
            placeholder="External Page Name (optional)"
          />
          <Input
            value={mappingDraft.notes}
            onChange={(event) =>
              setMappingDraft((prev) => ({ ...prev, notes: event.target.value }))
            }
            placeholder="Notes (optional)"
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={mappingDraft.isActive}
              onChange={(event) =>
                setMappingDraft((prev) => ({ ...prev, isActive: event.target.checked }))
              }
            />
            Mapping Active
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => void saveMapping()} disabled={saving}>
            Save Mapping
          </Button>
          <Button type="button" variant="secondary" onClick={() => void loadConfiguration()} disabled={saving}>
            Refresh
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
              {safeConfiguration.mappings.map((mapping) => (
                <tr key={mapping.id} className="border-b border-slate-100">
                  <td className="py-2">{mapping.external_page_id}</td>
                  <td className="py-2">{mapping.external_page_key || "-"}</td>
                  <td className="py-2">{mapping.external_page_name || "-"}</td>
                  <td className="py-2">
                    {safeConfiguration.campaigns.find((campaign) => campaign.id === mapping.crm_campaign_id)?.name ||
                      mapping.crm_campaign_id}
                  </td>
                  <td className="py-2">{mapping.is_active ? "Active" : "Inactive"}</td>
                  <td className="py-2">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => void deleteMapping(mapping.id)}
                      disabled={saving}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {safeConfiguration.mappings.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={6}>
                    No mappings configured yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex gap-2">
        <Button type="button" onClick={() => void saveConfiguration()} disabled={saving}>
          {saving ? "Saving..." : "Save Configuration"}
        </Button>
      </div>
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
