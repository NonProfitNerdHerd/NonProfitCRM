import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getIntegrationDetailForAdmin } from "@/lib/data/integrations";
import { GivingFuelContactsSetup } from "@/components/admin/integrations/givingfuel-contacts-setup";
import { GivingFuelDonationsSetup } from "@/components/admin/integrations/givingfuel-donations-setup";
import {
  GIVINGFUEL_DONATIONS_INTEGRATION_KEY,
  GIVINGFUEL_WEBHOOK_INTEGRATION_KEY
} from "@/lib/integrations/givingfuel-contacts-config";
import { GivingFuelWebhookSetup } from "@/components/admin/integrations/givingfuel-webhook-setup";
import { IntegrationEnableToggleButton } from "@/components/admin/integrations/integration-enable-toggle-button";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export default async function IntegrationDetailPage({ params, searchParams }: RouteProps) {
  const { integrationKey } = await params;
  const supportedIntegration =
    integrationKey === "webconnex" ||
    integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY ||
    integrationKey === GIVINGFUEL_WEBHOOK_INTEGRATION_KEY;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = resolvedSearchParams?.tab === "status" ? "status" : "configuration";
  let detail:
    | {
        definition: Record<string, unknown>;
        connection: Record<string, unknown>;
        jobs: Array<Record<string, unknown>>;
        errors: Array<Record<string, unknown>>;
        overview: Record<string, unknown>;
        apiPaused?: boolean;
      }
    | null = null;
  let loadError: string | null = null;

  try {
    detail = (await getIntegrationDetailForAdmin(integrationKey)) as unknown as {
      definition: Record<string, unknown>;
      connection: Record<string, unknown>;
      jobs: Array<Record<string, unknown>>;
      errors: Array<Record<string, unknown>>;
      overview: Record<string, unknown>;
      apiPaused?: boolean;
    };
    loadError =
      (detail as { schemaWarning?: string | null })?.schemaWarning ??
      null;
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Integration detail could not be loaded in this environment.";
    const now = new Date().toISOString();
    detail = {
      definition: {
        id: `fallback-${integrationKey}`,
        name:
          integrationKey === "webconnex"
            ? "GivingFuel Contacts"
            : integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY
              ? "GivingFuel Donations"
              : integrationKey === GIVINGFUEL_WEBHOOK_INTEGRATION_KEY
                ? "GivingFuel Webhook"
              : integrationKey,
        provider_key: integrationKey,
        description: "Fallback integration detail due environment configuration mismatch.",
        category: "donations",
        is_active: true,
        supports_manual_sync: true,
        supports_scheduled_sync: true,
        supports_test_connection: true,
        created_at: now,
        updated_at: now
      },
      connection: {
        id: `fallback-${integrationKey}-connection`,
        organization_id: "",
        integration_definition_id: `fallback-${integrationKey}`,
        name:
          integrationKey === "webconnex"
            ? "GivingFuel Contacts"
            : integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY
              ? "GivingFuel Donations"
              : integrationKey === GIVINGFUEL_WEBHOOK_INTEGRATION_KEY
                ? "GivingFuel Webhook"
              : integrationKey,
        base_url: "",
        auth_type: "api_key_header",
        api_key_reference: null,
        is_enabled: false,
        connection_status: "not_tested",
        last_connection_test_date: null,
        last_connection_test_result: loadError,
        timeout_ms: 30000,
        retry_settings: { maxRetries: 3, backoffMs: 1000 },
        debug_logging_enabled: false,
        configuration_json: {},
        sync_settings_json: {},
        field_mapping_json: { contacts: {}, donations: {} },
        created_by: null,
        updated_by: null,
        created_at: now,
        updated_at: now
      },
      jobs: [],
      errors: [],
      overview: {
        integrationName:
          integrationKey === "webconnex"
            ? "GivingFuel Contacts"
            : integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY
              ? "GivingFuel Donations"
              : integrationKey === GIVINGFUEL_WEBHOOK_INTEGRATION_KEY
                ? "GivingFuel Webhook"
              : integrationKey,
        description: "Integration framework fallback detail",
        currentStatus: "Disabled",
        connectionStatus: "Not Tested",
        lastSuccessfulSync: null,
        lastFailedSync: null,
        lastSyncDurationMs: null,
        lastRecordProcessedAt: null,
        totalContactsSynced: 0,
        totalDonationsSynced: 0,
        failedRecordsCount: 0
      },
      apiPaused: true
    };
  }

  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-3">
        <Link href="/staff/admin/integrations">
          <Button type="button" variant="ghost">
            Back to Integrations
          </Button>
        </Link>
        {supportedIntegration ? (
          <IntegrationEnableToggleButton
            integrationKey={integrationKey}
            initialIsEnabled={Boolean(
              (detail?.connection as { is_enabled?: boolean } | null | undefined)?.is_enabled
            )}
          />
        ) : null}
      </div>
      <CardHeader
        title={`${String(detail?.connection?.name ?? detail?.definition?.name ?? integrationKey)} Integration`}
        subtitle={
          integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY
            ? "GivingFuel donations API key setup, page mapping, and transaction synchronization"
            : integrationKey === GIVINGFUEL_WEBHOOK_INTEGRATION_KEY
              ? "Configure GivingFuel webhook security, module visibility, campaign mapping, and review automation"
            : "GivingFuel contacts API key setup and contacts synchronization"
        }
      />
      {loadError ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {loadError}
        </p>
      ) : null}
      {!supportedIntegration ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          This integration is not available in the current implementation.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
            <Link href={`/staff/admin/integrations/${encodeURIComponent(integrationKey)}?tab=configuration`}>
              <Button type="button" variant={activeTab === "configuration" ? "primary" : "secondary"}>
                Configuration
              </Button>
            </Link>
            <Link href={`/staff/admin/integrations/${encodeURIComponent(integrationKey)}?tab=status`}>
              <Button type="button" variant={activeTab === "status" ? "primary" : "secondary"}>
                Integration Status
              </Button>
            </Link>
          </div>
          {activeTab === "status" ? (
            <IntegrationStatusPanel
              detail={detail as {
                connection: Record<string, unknown>;
                jobs: Array<Record<string, unknown>>;
                overview: Record<string, unknown>;
              }}
            />
          ) : integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY ? (
            <GivingFuelDonationsSetup
              integrationKey={integrationKey}
              initialData={detail as {
                definition: Record<string, unknown>;
                connection: Record<string, unknown>;
                jobs: Array<Record<string, unknown>>;
                errors: Array<Record<string, unknown>>;
                overview: Record<string, unknown>;
                apiPaused?: boolean;
              }}
            />
          ) : integrationKey === GIVINGFUEL_WEBHOOK_INTEGRATION_KEY ? (
            <GivingFuelWebhookSetup
              integrationKey={integrationKey}
              initialData={detail as {
                definition: Record<string, unknown>;
                connection: Record<string, unknown>;
                jobs: Array<Record<string, unknown>>;
                errors: Array<Record<string, unknown>>;
                overview: Record<string, unknown>;
                apiPaused?: boolean;
              }}
            />
          ) : (
            <GivingFuelContactsSetup
              integrationKey={integrationKey}
              initialData={detail as {
                definition: Record<string, unknown>;
                connection: Record<string, unknown>;
                jobs: Array<Record<string, unknown>>;
                errors: Array<Record<string, unknown>>;
                overview: Record<string, unknown>;
                apiPaused?: boolean;
              }}
            />
          )}
        </>
      )}
    </Card>
  );
}

function IntegrationStatusPanel({
  detail
}: {
  detail: {
    connection: Record<string, unknown>;
    jobs: Array<Record<string, unknown>>;
    overview: Record<string, unknown>;
  };
}) {
  const latestJob = detail.jobs[0] ?? null;
  const recordsProcessed = Number(latestJob?.records_processed ?? 0);
  const totalExpected = Number(latestJob?.total_records_expected ?? 0);
  const progress =
    Number.isFinite(totalExpected) && totalExpected > 0
      ? `${recordsProcessed.toLocaleString()} of ${totalExpected.toLocaleString()}`
      : `${recordsProcessed.toLocaleString()} processed`;

  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-4">
      <h4 className="text-sm font-semibold text-slate-900">Integration Status & Diagnostics</h4>
      <div className="grid gap-2 text-xs md:grid-cols-2">
        <TileLabel
          label="Enabled"
          value={Boolean(detail.connection.is_enabled) ? "Enabled" : "Disabled"}
        />
        <TileLabel
          label="Connection Status"
          value={String(detail.connection.connection_status ?? "Not Tested")}
        />
        <TileLabel label="Run ID" value={String(latestJob?.id ?? "-")} />
        <TileLabel label="Last Sync Start" value={formatDateTime(latestJob?.started_date)} />
        <TileLabel label="Last Sync End" value={formatDateTime(latestJob?.completed_date)} />
        <TileLabel
          label="Last Successful Sync"
          value={formatDateTime(detail.overview.lastSuccessfulSync)}
        />
        <TileLabel
          label="Last Record Processed"
          value={formatDateTime(detail.overview.lastRecordProcessedAt)}
        />
        <TileLabel label="Progress" value={progress} />
        <TileLabel
          label="Retrieved"
          value={Number(latestJob?.records_retrieved ?? 0).toLocaleString()}
        />
        <TileLabel label="Inserted" value={Number(latestJob?.records_created ?? 0).toLocaleString()} />
        <TileLabel label="Updated" value={Number(latestJob?.records_updated ?? 0).toLocaleString()} />
        <TileLabel
          label="Skipped"
          value={Number(latestJob?.records_skipped ?? 0).toLocaleString()}
        />
        <TileLabel label="Failed" value={Number(latestJob?.records_failed ?? 0).toLocaleString()} />
        <TileLabel
          label="Current Page / Cursor"
          value={`${String(latestJob?.current_page ?? "-")} / ${String(latestJob?.current_cursor ?? "-")}`}
        />
        <TileLabel
          label="Error Summary"
          value={String(latestJob?.error_summary ?? "No error summary.")}
        />
      </div>
    </section>
  );
}

function TileLabel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
      <p className="uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-slate-800">{value}</p>
    </div>
  );
}

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
