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
  if (searchParams) {
    await searchParams;
  }
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
        totalContactsSynced: 0,
        totalDonationsSynced: 0,
        failedRecordsCount: 0
      },
      apiPaused: true
    };
  }

  return (
    <Card>
      <div className="mb-2">
        <Link href="/staff/admin/integrations">
          <Button type="button" variant="ghost">
            Back to Integrations
          </Button>
        </Link>
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
    </Card>
  );
}
