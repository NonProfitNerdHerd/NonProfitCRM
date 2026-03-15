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
  apiPaused?: boolean;
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
  const [loading, setLoading] = useState<"test" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiPaused = Boolean(data.apiPaused);
  const config = (data.connection.configuration_json as Record<string, unknown>) ?? {};
  const apiKeyConfigured = Boolean(config.apiKeyConfigured);

  async function refresh() {
    const response = await fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to refresh integration.");
    setData(payload as DetailPayload);
  }

  async function runAction(
    action: "test" | "save",
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
      setMessage(payload?.message ?? successMessage);
      if (action === "save") setApiKey("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Request failed.");
    } finally {
      setLoading(null);
    }
  }

  const latestContactJob = useMemo(() => {
    return data.jobs.find((job) => String(job.sync_scope ?? "") === "contacts") ?? null;
  }, [data.jobs]);

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
