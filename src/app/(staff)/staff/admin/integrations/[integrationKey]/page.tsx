import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getIntegrationDetailForAdmin } from "@/lib/data/integrations";
import { WebconnexIntegrationDetail } from "@/components/admin/integrations/webconnex-integration-detail";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

function resolveTab(tab: string | undefined) {
  if (!tab) return "overview";
  if (
    tab === "overview" ||
    tab === "configuration" ||
    tab === "sync" ||
    tab === "mapping" ||
    tab === "history" ||
    tab === "errors"
  ) {
    return tab;
  }
  return "overview";
}

export default async function IntegrationDetailPage({ params, searchParams }: RouteProps) {
  const { integrationKey } = await params;
  const query = searchParams ? await searchParams : {};
  let detail:
    | {
        definition: Record<string, unknown>;
        connection: Record<string, unknown>;
        jobs: Array<Record<string, unknown>>;
        errors: Array<Record<string, unknown>>;
        overview: Record<string, unknown>;
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
        name: integrationKey === "webconnex" ? "Giving Fuel" : integrationKey,
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
        name: integrationKey === "webconnex" ? "Giving Fuel" : integrationKey,
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
        integrationName: integrationKey === "webconnex" ? "Giving Fuel" : integrationKey,
        description: "Integration framework fallback detail",
        currentStatus: "Disabled",
        connectionStatus: "Not Tested",
        lastSuccessfulSync: null,
        lastFailedSync: null,
        lastSyncDurationMs: null,
        totalContactsSynced: 0,
        totalDonationsSynced: 0,
        failedRecordsCount: 0
      }
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
        subtitle="Connection configuration, sync settings, history, and error queue"
      />
      {loadError ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {loadError}
        </p>
      ) : null}
      <WebconnexIntegrationDetail
        integrationKey={integrationKey}
        initialData={detail as {
          definition: Record<string, unknown>;
          connection: Record<string, unknown>;
          jobs: Array<Record<string, unknown>>;
          errors: Array<Record<string, unknown>>;
          overview: Record<string, unknown>;
        }}
        initialTab={resolveTab(query.tab)}
      />
    </Card>
  );
}
