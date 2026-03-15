"use client";

import { useEffect, useMemo, useState } from "react";
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

type MappingPayload = {
  mappings: Array<{
    id: string;
    externalPageValue: string;
    status: "mapped" | "unmapped";
    mappedCampaignId: string | null;
    mappedSubCampaignId: string | null;
    firstDetectedAt: string | null;
    lastDetectedAt: string | null;
  }>;
  campaigns: Array<{ id: string; name: string; status: string }>;
  subCampaigns: Array<{
    id: string;
    campaignId: string;
    name: string;
    status: string;
    externalPageKey: string;
  }>;
  summary: {
    total: number;
    mapped: number;
    unmapped: number;
  };
};

export function GivingFuelDonationsSetup({
  integrationKey,
  initialData
}: {
  integrationKey: string;
  initialData: DetailPayload;
}) {
  const [data, setData] = useState(initialData);
  const [mappingData, setMappingData] = useState<MappingPayload | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState<"test" | "save" | "sync" | "detect" | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mappingEdits, setMappingEdits] = useState<Record<string, { campaignId: string }>>({});
  const [savingMappingId, setSavingMappingId] = useState<string | null>(null);
  const [payloadViewer, setPayloadViewer] = useState<Record<string, unknown> | null>(null);

  const apiPaused = Boolean(data.apiPaused);
  const config = (data.connection.configuration_json as Record<string, unknown>) ?? {};
  const apiKeyConfigured = Boolean(config.apiKeyConfigured);

  async function refreshDetail() {
    const response = await fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to refresh integration detail.");
    setData(payload as DetailPayload);
  }

  async function loadMappings() {
    setMappingLoading(true);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/donations/mappings`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to load donation page mappings.");
      }
      const typed = payload as MappingPayload;
      setMappingData(typed);
      const seeded: Record<string, { campaignId: string }> = {};
      for (const row of typed.mappings) {
        seeded[row.id] = {
          campaignId: row.mappedCampaignId ?? ""
        };
      }
      setMappingEdits(seeded);
    } finally {
      setMappingLoading(false);
    }
  }

  async function runAction(
    action: "test" | "save" | "sync" | "detect",
    request: () => Promise<Response>,
    successMessage: string
  ) {
    setLoading(action);
    setMessage(null);
    setError(null);
    try {
      const response = await request();
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Request failed.");
      await refreshDetail();
      await loadMappings();
      if (action === "save") setApiKey("");
      setMessage(payload?.message ?? successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Request failed.");
    } finally {
      setLoading(null);
    }
  }

  async function saveMapping(mappingId: string, externalPageValue: string) {
    const draft = mappingEdits[mappingId];
    if (!draft?.campaignId) {
      setError("Campaign selection is required before saving this mapping.");
      return;
    }
    setSavingMappingId(mappingId);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/donations/mappings`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            externalPageValue,
            campaignId: draft.campaignId,
          subCampaignId: null
          })
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to save mapping.");
      await loadMappings();
      setMessage(`Saved mapping for "${externalPageValue}".`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save mapping.");
    } finally {
      setSavingMappingId(null);
    }
  }

  async function resolveError(errorId: string) {
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/errors/${encodeURIComponent(errorId)}/resolve`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to resolve error.");
      await refreshDetail();
      setMessage(payload?.message ?? "Error marked as resolved.");
    } catch (resolveErrorValue) {
      setError(resolveErrorValue instanceof Error ? resolveErrorValue.message : "Unable to resolve error.");
    }
  }

  useEffect(() => {
    void loadMappings().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load mappings.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationKey]);

  const unmappedRows = useMemo(
    () => (mappingData?.mappings ?? []).filter((row) => row.status !== "mapped"),
    [mappingData]
  );
  const allMapped = useMemo(() => {
    if (!mappingData) return false;
    if (mappingData.summary.total === 0) return false;
    return mappingData.summary.unmapped === 0;
  }, [mappingData]);
  const donationJobs = useMemo(
    () =>
      data.jobs.filter((row) => {
        const scope = String(row.sync_scope ?? "");
        return scope === "donations" || scope === "all";
      }),
    [data.jobs]
  );
  const donationErrors = useMemo(
    () => data.errors.filter((row) => String(row.entity_type ?? "").toLowerCase() === "donation"),
    [data.errors]
  );
  const campaignNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const campaign of mappingData?.campaigns ?? []) {
      map.set(campaign.id, campaign.name);
    }
    return map;
  }, [mappingData]);

  function exportFormNamesCsv() {
    const rows = mappingData?.mappings ?? [];
    if (rows.length === 0) {
      setMessage("No detected form names available to export.");
      return;
    }
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csvLines = [
      ["Form Name", "Mapping Status", "Mapped Campaign"].map(escape).join(","),
      ...rows.map((row) =>
        [
          row.externalPageValue,
          row.status === "mapped" ? "Mapped" : "Unmapped",
          row.mappedCampaignId ? campaignNameById.get(row.mappedCampaignId) ?? "" : ""
        ]
          .map((value) => escape(String(value)))
          .join(",")
      )
    ];
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "givingfuel-form-names.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleStepChange(step: 1 | 2 | 3) {
    if (step === 3 && !allMapped) {
      setError("Step 3 is locked until all detected form names are mapped to campaigns.");
      setActiveStep(2);
      return;
    }
    setError(null);
    setActiveStep(step);
  }

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
        <div className="mb-3 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <Button
            type="button"
            variant={activeStep === 1 ? "default" : "secondary"}
            onClick={() => handleStepChange(1)}
          >
            Step 1: Setup API
          </Button>
          <Button
            type="button"
            variant={activeStep === 2 ? "default" : "secondary"}
            onClick={() => handleStepChange(2)}
          >
            Step 2: Map Campaigns
          </Button>
          <Button
            type="button"
            variant={activeStep === 3 ? "default" : "secondary"}
            onClick={() => handleStepChange(3)}
            disabled={!allMapped}
            title={!allMapped ? "Map all detected forms first" : undefined}
          >
            Step 3: Sync Data
          </Button>
        </div>

        {activeStep === 1 ? (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-900">Step 1: Setup API</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">Integration Name</label>
                <Input value={String(data.connection.name ?? "GivingFuel Donations")} disabled />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">API Key</label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={apiKeyConfigured ? "******** (already configured)" : "Enter API key"}
                  disabled={apiPaused || Boolean(loading)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
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
                    "Connection test completed."
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
                            name: "GivingFuel Donations"
                          })
                        }
                      ),
                    "API key saved and integration connected."
                  )
                }
              >
                {loading === "save" ? "Saving..." : "Save / Connect"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => handleStepChange(2)}>
                Next: Map Campaigns
              </Button>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <Info label="Method" value="GET" />
              <Info label="Base URL" value="https://api.webconnex.com/v2/public" />
              <Info label="Endpoint" value="/search/transactions" />
              <Info label="Header" value="apiKey: <your key>" />
              <Info label="Query Parameter" value="product=givingfuel.com" />
            </div>
          </div>
        ) : null}

        {activeStep === 2 ? (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-900">Step 2: Map Campaigns</h4>
            <p className="text-xs text-slate-500">
              Detect GivingFuel form names, map each form to a CRM campaign, and export the form list
              to CSV for campaign buildout if needed.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={apiPaused || Boolean(loading)}
                onClick={() =>
                  void runAction(
                    "detect",
                    () =>
                      fetch(
                        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/donations/detect-pages`,
                        { method: "POST" }
                      ),
                    "Detected latest GivingFuel form names."
                  )
                }
              >
                {loading === "detect" ? "Detecting..." : "Detect Form Names"}
              </Button>
              <Button type="button" variant="secondary" onClick={exportFormNamesCsv}>
                Export Form Names CSV
              </Button>
              <Button type="button" variant="secondary" onClick={() => void loadMappings()} disabled={mappingLoading}>
                {mappingLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-3">
              <Info label="Detected Forms" value={String(mappingData?.summary.total ?? 0)} />
              <Info label="Mapped" value={String(mappingData?.summary.mapped ?? 0)} />
              <Info label="Unmapped" value={String(mappingData?.summary.unmapped ?? 0)} />
            </div>
            {unmappedRows.length > 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                {unmappedRows.length} form name(s) remain unmapped. Step 3 is locked until all detected
                forms are mapped.
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Form Name</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Campaign</th>
                    <th className="py-2">Last Detected</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(mappingData?.mappings ?? []).map((row) => {
                    const draft = mappingEdits[row.id] ?? {
                      campaignId: row.mappedCampaignId ?? ""
                    };
                    return (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="py-2">{row.externalPageValue || "-"}</td>
                        <td className="py-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${
                              row.status === "mapped"
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {row.status === "mapped" ? "Mapped" : "Unmapped"}
                          </span>
                        </td>
                        <td className="py-2">
                          <select
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                            value={draft.campaignId}
                            onChange={(event) =>
                              setMappingEdits((prev) => ({
                                ...prev,
                                [row.id]: { campaignId: event.target.value }
                              }))
                            }
                          >
                            <option value="">Select campaign</option>
                            {(mappingData?.campaigns ?? []).map((campaign) => (
                              <option key={campaign.id} value={campaign.id}>
                                {campaign.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2">{formatDate(row.lastDetectedAt)}</td>
                        <td className="py-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void saveMapping(row.id, row.externalPageValue)}
                            disabled={savingMappingId === row.id}
                          >
                            {savingMappingId === row.id ? "Saving..." : "Save Mapping"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {!mappingLoading && (mappingData?.mappings.length ?? 0) === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={5}>
                        No form names detected yet. Click “Detect Form Names.”
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => handleStepChange(3)} disabled={!allMapped}>
                Continue to Step 3
              </Button>
            </div>
          </div>
        ) : null}

        {activeStep === 3 ? (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-900">Step 3: Sync Data</h4>
            {!allMapped ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Map all detected form names in Step 2 before syncing donations.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={apiPaused || Boolean(loading) || !allMapped}
                onClick={() =>
                  void runAction(
                    "sync",
                    () =>
                      fetch(
                        `/api/admin/integrations/${encodeURIComponent(integrationKey)}/sync/donations`,
                        { method: "POST" }
                      ),
                    "Donations sync completed."
                  )
                }
              >
                {loading === "sync" ? "Syncing..." : "Run Donations Sync"}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Job ID</th>
                    <th className="py-2">Started</th>
                    <th className="py-2">Completed</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Processed</th>
                    <th className="py-2">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {donationJobs.map((job) => (
                    <tr key={String(job.id)} className="border-b border-slate-100">
                      <td className="py-2">{String(job.id ?? "-")}</td>
                      <td className="py-2">{formatDateTime(job.started_date as string | null)}</td>
                      <td className="py-2">{formatDateTime(job.completed_date as string | null)}</td>
                      <td className="py-2">{String(job.status ?? "-")}</td>
                      <td className="py-2">{String(job.records_processed ?? 0)}</td>
                      <td className="py-2">{String(job.records_failed ?? 0)}</td>
                    </tr>
                  ))}
                  {donationJobs.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={6}>
                        No donation sync jobs yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="py-2">Error ID</th>
                    <th className="py-2">Source Record</th>
                    <th className="py-2">Error</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {donationErrors.map((row) => (
                    <tr key={String(row.id)} className="border-b border-slate-100">
                      <td className="py-2">{String(row.id ?? "-")}</td>
                      <td className="py-2">{String(row.source_record_id ?? "-")}</td>
                      <td className="py-2">{String(row.error_message ?? "-")}</td>
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
                            disabled={String(row.status ?? "").toLowerCase() === "resolved"}
                          >
                            {String(row.status ?? "").toLowerCase() === "resolved"
                              ? "Resolved"
                              : "Resolve"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {donationErrors.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={5}>
                        No donation errors.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

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
