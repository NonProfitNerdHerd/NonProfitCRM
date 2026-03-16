import {
  requireIntegrationManagerRole,
  requireStaffPermission
} from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  IntegrationConnection,
  IntegrationDefinition,
  IntegrationErrorQueueItem,
  IntegrationSyncJob,
  SyncScope
} from "@/lib/integrations/types";
import { IntegrationRegistryService } from "@/lib/integrations/integration-registry-service";
import { IntegrationConfigurationService } from "@/lib/integrations/integration-configuration-service";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import { IntegrationJobRunner } from "@/lib/integrations/integration-job-runner";
import { IntegrationRetryService } from "@/lib/integrations/integration-retry-service";
import { WebconnexSyncService } from "@/lib/integrations/webconnex-sync-service";
import { KindfulSyncService } from "@/lib/integrations/kindful-sync-service";
import { ContactSyncService } from "@/lib/integrations/contact-sync-service";
import { createIntegrationClient } from "@/lib/integrations/db";
import { logAuditEvent } from "@/lib/data/audit";
import {
  GIVINGFUEL_API_HEADER_NAME,
  GIVINGFUEL_BASE_URL,
  GIVINGFUEL_CUSTOMERS_PATH,
  GIVINGFUEL_DONATIONS_INTEGRATION_KEY,
  GIVINGFUEL_DONATIONS_INTEGRATION_NAME,
  GIVINGFUEL_FORMS_PATH,
  GIVINGFUEL_INTEGRATION_KEY,
  GIVINGFUEL_INTEGRATION_NAME,
  GIVINGFUEL_PRODUCT_VALUE,
  GIVINGFUEL_TRANSACTIONS_PATH,
  isGivingFuelIntegrationKey
} from "@/lib/integrations/givingfuel-contacts-config";
import {
  isKindfulIntegrationKey,
  KINDFUL_AUTH_HEADER_NAME,
  KINDFUL_AUTH_HEADER_PREFIX,
  KINDFUL_BASE_URL,
  KINDFUL_CONTACTS_QUERY_PATH,
  KINDFUL_DEFAULT_PAGE_SIZE,
  KINDFUL_IMPORT_STATUS_PATH_TEMPLATE,
  KINDFUL_INTEGRATION_KEY,
  KINDFUL_INTEGRATION_NAME,
  KINDFUL_NOTES_PATH,
  KINDFUL_SYNC_STATUS_PATH,
  KINDFUL_TRANSACTIONS_QUERY_PATH,
  KINDFUL_ACTIVITIES_PATH
} from "@/lib/integrations/kindful-config";

const registryService = new IntegrationRegistryService();
const configurationService = new IntegrationConfigurationService();
const logService = new IntegrationLogService();
const jobRunner = new IntegrationJobRunner();
const retryService = new IntegrationRetryService();
const webconnexSyncService = new WebconnexSyncService();
const kindfulSyncService = new KindfulSyncService();
const contactSyncService = new ContactSyncService();
const INTEGRATIONS_API_PAUSED = process.env.INTEGRATIONS_API_PAUSED === "true";
const INTEGRATIONS_API_PAUSED_MESSAGE =
  "Integrations API is temporarily disabled. We will restart this integration implementation from scratch.";
const INTEGRATIONS_SCHEMA_ERROR_MESSAGE =
  "Integrations schema is not available in this environment yet. Run Supabase migration 202603130021 (and newer) and retry.";

export type RecentSyncedContactRow = {
  externalRecordId: string;
  lastSyncedDate: string | null;
  sourceSystem: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    city: string;
    state: string;
    updatedAt: string | null;
  };
};

export type DonationPageMappingRow = {
  id: string;
  externalPageValue: string;
  status: "mapped" | "unmapped";
  mappedCampaignId: string | null;
  mappedSubCampaignId: string | null;
  firstDetectedAt: string | null;
  lastDetectedAt: string | null;
};

function integrationDisplayName(key: string) {
  if (key === GIVINGFUEL_INTEGRATION_KEY) return GIVINGFUEL_INTEGRATION_NAME;
  if (key === GIVINGFUEL_DONATIONS_INTEGRATION_KEY) return GIVINGFUEL_DONATIONS_INTEGRATION_NAME;
  if (key === KINDFUL_INTEGRATION_KEY) return KINDFUL_INTEGRATION_NAME;
  return key;
}

function integrationTileType(key: string) {
  if (key === GIVINGFUEL_INTEGRATION_KEY) return "Contacts";
  if (key === GIVINGFUEL_DONATIONS_INTEGRATION_KEY) return "Donations";
  if (key === KINDFUL_INTEGRATION_KEY) return "Migration + Sync";
  return "General";
}

function isMissingIntegrationsSchemaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string };
  const text = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  if (
    candidate.code === "42P01" ||
    candidate.code === "42703" ||
    candidate.code === "PGRST205" ||
    candidate.code === "PGRST204"
  ) {
    return true;
  }
  return (
    (text.includes("does not exist") || text.includes("could not find")) &&
    (text.includes("integration_") ||
      text.includes("contact_external_references") ||
      text.includes("donation_external_references") ||
      text.includes("integration connections") ||
      text.includes("integration definitions"))
  );
}

function createFallbackDetail(integrationKey: string, organizationId: string) {
  const now = new Date().toISOString();
  const name = integrationDisplayName(integrationKey);
  const isGivingFuel = isGivingFuelIntegrationKey(integrationKey);
  const isKindful = isKindfulIntegrationKey(integrationKey);
  const isDonations = integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY;
  const fallbackBaseUrl = isKindful ? KINDFUL_BASE_URL : GIVINGFUEL_BASE_URL;
  return {
    definition: {
      id: `fallback-${integrationKey}`,
      name,
      provider_key: integrationKey,
      description:
        isGivingFuel
          ? isDonations
            ? "GivingFuel Donations API sync from Webconnex v2 public transactions endpoint."
            : "GivingFuel Contacts API sync from Webconnex v2 public customers endpoint."
          : isKindful
            ? "Kindful Customer API migration + transition sync."
          : "Integration metadata unavailable until migrations are applied.",
      category: isKindful || isDonations ? "donations" : "contacts",
      is_active: true,
      supports_manual_sync: true,
      supports_scheduled_sync: true,
      supports_test_connection: true,
      created_at: now,
      updated_at: now
    },
    connection: {
      id: `fallback-${integrationKey}-connection`,
      organization_id: organizationId,
      integration_definition_id: `fallback-${integrationKey}`,
      name,
      base_url: fallbackBaseUrl,
      auth_type: "api_key_header",
      api_key_reference: null,
      is_enabled: false,
      connection_status: "not_tested",
      last_connection_test_date: null,
      last_connection_test_result: INTEGRATIONS_SCHEMA_ERROR_MESSAGE,
      timeout_ms: 30000,
      retry_settings: { maxRetries: 3, backoffMs: 1000 },
      debug_logging_enabled: false,
      configuration_json: {
        ...(isKindful
          ? {
              contactsQueryPath: KINDFUL_CONTACTS_QUERY_PATH,
              transactionsQueryPath: KINDFUL_TRANSACTIONS_QUERY_PATH,
              notesPath: KINDFUL_NOTES_PATH,
              activitiesPath: KINDFUL_ACTIVITIES_PATH,
              syncStatusPath: KINDFUL_SYNC_STATUS_PATH,
              importStatusPathTemplate: KINDFUL_IMPORT_STATUS_PATH_TEMPLATE,
              authHeaderName: KINDFUL_AUTH_HEADER_NAME,
              authHeaderPrefix: KINDFUL_AUTH_HEADER_PREFIX,
              pageSize: KINDFUL_DEFAULT_PAGE_SIZE,
              requestIntervalMs: 200,
              environment: "production"
            }
          : {
              contactsPath: GIVINGFUEL_CUSTOMERS_PATH,
              transactionsPath: GIVINGFUEL_TRANSACTIONS_PATH,
              formsPath: GIVINGFUEL_FORMS_PATH,
              testPath: GIVINGFUEL_CUSTOMERS_PATH,
              authHeaderName: GIVINGFUEL_API_HEADER_NAME,
              staticQueryParams: { product: GIVINGFUEL_PRODUCT_VALUE }
            }),
        apiKeyConfigured: false
      },
      sync_settings_json: {
        syncMode: "manual_and_scheduled",
        scheduleFrequency: isKindful ? "hourly" : "daily",
        contactSyncEnabled: isKindful ? true : !isDonations,
        donationSyncEnabled: isKindful ? true : isDonations,
        noteSyncEnabled: isKindful ? true : false,
        activitySyncEnabled: isKindful ? true : false,
        fullSyncEnabled: isKindful,
        incrementalSyncEnabled: true,
        fallbackContactMatch: isKindful ? "email_phone_name_address" : "external_id_only",
        initialImportStartDate: null,
        lastSuccessfulSyncDate: null
      },
      field_mapping_json: {
        contacts: {},
        donations: {}
      },
      created_by: null,
      updated_by: null,
      created_at: now,
      updated_at: now
    },
    jobs: [],
    errors: [],
    overview: {
      integrationName: name,
      description:
        "Integration framework is installed in code, but database migration is pending in this environment.",
      currentStatus: "Disabled",
      connectionStatus: "Not Tested",
      lastSuccessfulSync: null,
      lastFailedSync: null,
      lastSyncDurationMs: null,
      totalContactsSynced: 0,
      totalContactsProcessed: 0,
      totalContactUpsertsSuccessful: 0,
      totalCrmContacts: 0,
      totalCrmPersonalContacts: 0,
      totalDonationsSynced: 0,
      failedRecordsCount: 0
    },
    schemaWarning: INTEGRATIONS_SCHEMA_ERROR_MESSAGE
  };
}

function buildSchemaFreeWebconnexConnection(
  organizationId: string,
  integrationKey: string
): IntegrationConnection {
  const now = new Date().toISOString();
  const fallbackWebconnexBaseUrl = GIVINGFUEL_BASE_URL;
  const isDonations = integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY;
  return {
    id: "schema-free-webconnex-connection",
    organization_id: organizationId,
    integration_definition_id: "schema-free-webconnex-definition",
    name: integrationDisplayName(integrationKey),
    base_url: fallbackWebconnexBaseUrl,
    auth_type: "api_key_header",
    api_key_reference: null,
    is_enabled: true,
    connection_status: "not_tested",
    last_connection_test_date: null,
    last_connection_test_result: null,
    timeout_ms: 30000,
    retry_settings: { maxRetries: 3, backoffMs: 1000 },
    debug_logging_enabled: false,
    configuration_json: {
      contactsPath: GIVINGFUEL_CUSTOMERS_PATH,
      transactionsPath: GIVINGFUEL_TRANSACTIONS_PATH,
      formsPath: GIVINGFUEL_FORMS_PATH,
      testPath: GIVINGFUEL_CUSTOMERS_PATH,
      authHeaderName: GIVINGFUEL_API_HEADER_NAME,
      staticQueryParams: { product: GIVINGFUEL_PRODUCT_VALUE },
      apiKeyConfigured: false
    },
    sync_settings_json: {
      syncMode: "manual_and_scheduled",
      scheduleFrequency: "daily",
      contactSyncEnabled: !isDonations,
      donationSyncEnabled: isDonations,
      fullSyncEnabled: false,
      incrementalSyncEnabled: true,
      fallbackContactMatch: "external_id_only"
    },
    field_mapping_json: { contacts: {}, donations: {} },
    created_by: null,
    updated_by: null,
    created_at: now,
    updated_at: now
  };
}

function sanitizeConnectionForUi(connection: IntegrationConnection): IntegrationConnection {
  const config = { ...(connection.configuration_json ?? {}) } as Record<string, unknown>;
  const hasApiKey = Boolean(config.encryptedApiKey) || Boolean(config.apiKeyConfigured);
  delete config.encryptedApiKey;
  config.apiKeyConfigured = hasApiKey;
  return {
    ...connection,
    configuration_json: config
  };
}

async function requireIntegrationsViewer() {
  return requireStaffPermission("can_view_dashboard");
}

async function requireIntegrationsManager() {
  return requireIntegrationManagerRole();
}

async function getDefinitionAndConnection(organizationId: string, userId: string, key: string) {
  const definition = await registryService.getDefinition(key);
  if (!definition) throw new Error(`Integration ${key} not found.`);
  const connection = await configurationService.ensureConnection(
    organizationId,
    userId,
    definition
  );
  return { definition, connection };
}

type IntegrationSyncHealth = "Fully Synced" | "Currently Working" | "Could Not Complete";

function deriveIntegrationSyncStatus(input: {
  jobs: IntegrationSyncJob[];
  isEnabled: boolean;
}) {
  const activeJob =
    input.jobs.find(
      (job) => String(job.status ?? "").toLowerCase() === "running" && !job.completed_date
    ) ?? null;
  const latestJob = input.jobs[0] ?? null;
  const referenceJob = activeJob ?? latestJob;
  const lastSuccessfulJob =
    input.jobs.find((job) => {
      const completedSuccessfully = Boolean(
        (job as unknown as { completed_successfully?: boolean }).completed_successfully
      );
      if (completedSuccessfully) return true;
      return (
        String(job.status ?? "").toLowerCase() === "completed" && Number(job.records_failed ?? 0) === 0
      );
    }) ?? null;

  const jobCompletedSuccessfully = referenceJob
    ? typeof (referenceJob as unknown as { completed_successfully?: unknown }).completed_successfully ===
      "boolean"
      ? Boolean((referenceJob as unknown as { completed_successfully?: boolean }).completed_successfully)
      : String(referenceJob.status ?? "").toLowerCase() === "completed" &&
        Number(referenceJob.records_failed ?? 0) === 0
    : false;
  const pagingComplete = referenceJob
    ? typeof (referenceJob as unknown as { paging_complete?: unknown }).paging_complete === "boolean"
      ? Boolean((referenceJob as unknown as { paging_complete?: boolean }).paging_complete)
      : String(referenceJob.status ?? "").toLowerCase() === "completed"
    : false;

  let syncStatus: IntegrationSyncHealth = "Could Not Complete";
  let syncStatusColor: "green" | "yellow" | "red" = "red";
  if (activeJob) {
    syncStatus = "Currently Working";
    syncStatusColor = "yellow";
  } else if (
    referenceJob &&
    jobCompletedSuccessfully &&
    pagingComplete &&
    Number(referenceJob.records_failed ?? 0) === 0
  ) {
    syncStatus = "Fully Synced";
    syncStatusColor = "green";
  }

  const recordsProcessed = Number(referenceJob?.records_processed ?? 0);
  const totalExpectedRaw = (referenceJob as unknown as { total_records_expected?: unknown })
    ?.total_records_expected;
  const totalRecordsExpected =
    typeof totalExpectedRaw === "number" && Number.isFinite(totalExpectedRaw)
      ? totalExpectedRaw
      : null;
  const currentPageRaw = (referenceJob as unknown as { current_page?: unknown })?.current_page;
  const currentPage =
    typeof currentPageRaw === "number" && Number.isFinite(currentPageRaw) ? currentPageRaw : null;
  const currentCursorRaw = (referenceJob as unknown as { current_cursor?: unknown })?.current_cursor;
  const currentCursor = typeof currentCursorRaw === "string" && currentCursorRaw.trim() ? currentCursorRaw : null;
  const detailFromJob =
    typeof referenceJob?.error_summary === "string" && referenceJob.error_summary.trim()
      ? referenceJob.error_summary.trim()
      : null;

  let statusDetail = input.isEnabled
    ? "No sync run has completed yet."
    : "Disabled by administrator. Enable this integration to run sync.";
  if (syncStatus === "Currently Working" && referenceJob) {
    const pagePart = currentPage ? `page ${currentPage}` : "current page";
    if (totalRecordsExpected !== null) {
      statusDetail = `Syncing ${pagePart}: ${recordsProcessed.toLocaleString()} of ${totalRecordsExpected.toLocaleString()} processed.`;
    } else {
      statusDetail = `Syncing ${pagePart}: ${recordsProcessed.toLocaleString()} processed so far.`;
    }
  } else if (syncStatus === "Fully Synced" && referenceJob) {
    if (totalRecordsExpected !== null) {
      statusDetail = `Processed ${recordsProcessed.toLocaleString()} of ${totalRecordsExpected.toLocaleString()} records. Paging complete.`;
    } else {
      statusDetail = `Processed ${recordsProcessed.toLocaleString()} records. Paging complete.`;
    }
  } else if (referenceJob) {
    statusDetail =
      detailFromJob ??
      "Sync stopped before processing all available records/pages. Review run details and retry.";
    if (!input.isEnabled) {
      statusDetail = `${statusDetail} Disabled by administrator.`;
    }
  }

  return {
    syncStatus,
    syncStatusColor,
    statusDetail,
    activeRunId: activeJob?.id ?? null,
    latestRunId: latestJob?.id ?? null,
    lastSyncStartTime: latestJob?.started_date ?? null,
    lastSyncEndTime: latestJob?.completed_date ?? null,
    lastSuccessfulSyncTime: lastSuccessfulJob?.completed_date ?? null,
    recordsRetrieved:
      Number((referenceJob as unknown as { records_retrieved?: number })?.records_retrieved ?? 0) ||
      Number(referenceJob?.records_processed ?? 0),
    recordsProcessed,
    recordsInserted: Number(referenceJob?.records_created ?? 0),
    recordsUpdated: Number(referenceJob?.records_updated ?? 0),
    recordsSkipped: Number((referenceJob as unknown as { records_skipped?: number })?.records_skipped ?? 0),
    recordsFailed: Number(referenceJob?.records_failed ?? 0),
    totalRecordsExpected,
    currentPage,
    currentCursor,
    errorSummary: detailFromJob,
    completedSuccessfully: syncStatus === "Fully Synced"
  };
}

async function countUniqueLinkedContacts(input: {
  organizationId: string;
  integrationKey: string;
}) {
  const supabase = await createIntegrationClient();
  const sourceSystems = isGivingFuelIntegrationKey(input.integrationKey)
    ? ["givingfuel", "webconnex"]
    : [input.integrationKey];
  const uniqueContactIds = new Set<string>();
  const pageSize = 1000;
  let offset = 0;
  let keepLoading = true;
  let safetyGuard = 0;

  while (keepLoading && safetyGuard < 200) {
    safetyGuard += 1;
    const { data, error } = await supabase
      .from("contact_external_references")
      .select("contact_id")
      .eq("organization_id", input.organizationId)
      .in("source_system", sourceSystems)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ contact_id?: string | null }>;
    for (const row of rows) {
      if (row.contact_id) uniqueContactIds.add(row.contact_id);
    }
    keepLoading = rows.length === pageSize;
    offset += rows.length;
  }

  return uniqueContactIds.size;
}

export async function listIntegrationsForAdmin() {
  const context = await requireIntegrationsViewer();
  const supabase = await createClient();
  const { data: canManageIntegrationRaw } = await supabase.rpc("has_permission", {
    org_id: context.organizationId,
    permission_key: "can_manage_integrations"
  });
  const canManageIntegration = Boolean(canManageIntegrationRaw);
  try {
    const definitions = await registryService.listDefinitions();
    const rows: Array<{
      definition: IntegrationDefinition;
      connection: IntegrationConnection | null;
      lastJob: IntegrationSyncJob | null;
      jobs: IntegrationSyncJob[];
    }> = [];
    for (const definition of definitions) {
      const connection = await configurationService.ensureConnection(
        context.organizationId,
        context.userId,
        definition
      );
      const safeConnection = sanitizeConnectionForUi(connection);
      const jobs = await logService.listJobs(context.organizationId, connection.id);
      rows.push({
        definition,
        connection: safeConnection,
        lastJob: jobs[0] ?? null,
        jobs
      });
    }
    const existingKeys = new Set(rows.map((row) => row.definition.provider_key));
    const now = new Date().toISOString();
    if (!existingKeys.has(GIVINGFUEL_INTEGRATION_KEY)) {
      rows.push({
        definition: {
          id: `fallback-${GIVINGFUEL_INTEGRATION_KEY}`,
          name: GIVINGFUEL_INTEGRATION_NAME,
          provider_key: GIVINGFUEL_INTEGRATION_KEY,
          description: "GivingFuel contacts synchronization.",
          category: "contacts",
          is_active: true,
          supports_manual_sync: true,
          supports_scheduled_sync: true,
          supports_test_connection: true,
          created_at: now,
          updated_at: now
        },
        connection: null,
        lastJob: null,
        jobs: []
      });
    }
    if (!existingKeys.has(GIVINGFUEL_DONATIONS_INTEGRATION_KEY)) {
      rows.push({
        definition: {
          id: `fallback-${GIVINGFUEL_DONATIONS_INTEGRATION_KEY}`,
          name: GIVINGFUEL_DONATIONS_INTEGRATION_NAME,
          provider_key: GIVINGFUEL_DONATIONS_INTEGRATION_KEY,
          description: "GivingFuel donations synchronization.",
          category: "donations",
          is_active: true,
          supports_manual_sync: true,
          supports_scheduled_sync: true,
          supports_test_connection: true,
          created_at: now,
          updated_at: now
        },
        connection: null,
        lastJob: null,
        jobs: []
      });
    }
    if (!existingKeys.has(KINDFUL_INTEGRATION_KEY)) {
      rows.push({
        definition: {
          id: `fallback-${KINDFUL_INTEGRATION_KEY}`,
          name: KINDFUL_INTEGRATION_NAME,
          provider_key: KINDFUL_INTEGRATION_KEY,
          description: "Kindful migration + transition synchronization.",
          category: "donations",
          is_active: true,
          supports_manual_sync: true,
          supports_scheduled_sync: true,
          supports_test_connection: true,
          created_at: now,
          updated_at: now
        },
        connection: null,
        lastJob: null,
        jobs: []
      });
    }

    const failedJobs = rows.filter((row) => {
      const latest = row.jobs[0] ?? row.lastJob;
      if (!latest) return false;
      return (
        String(latest.status ?? "").toLowerCase() === "failed" ||
        String(latest.status ?? "").toLowerCase() === "completed_with_errors"
      );
    }).length;
    const enabled = rows.filter((row) => row.connection?.is_enabled).length;
    const last24hActivity = rows.reduce((acc, row) => {
      const started = row.lastJob?.started_date;
      if (!started) return acc;
      return new Date(started).getTime() > Date.now() - 24 * 60 * 60 * 1000 ? acc + 1 : acc;
    }, 0);

    return {
      integrations: rows.map((row) => {
        const syncStatus = deriveIntegrationSyncStatus({
          jobs: row.jobs,
          isEnabled: Boolean(row.connection?.is_enabled)
        });
        return {
          integrationKey: row.definition.provider_key,
          name: row.connection?.name || row.definition.name,
          providerType: integrationTileType(row.definition.provider_key),
          description: row.definition.description,
          enabledStatus: row.connection?.is_enabled ? "Enabled" : "Disabled",
          isEnabled: Boolean(row.connection?.is_enabled),
          connectionStatus: row.connection?.connection_status ?? "Not Tested",
          syncStatus: syncStatus.syncStatus,
          syncStatusColor: syncStatus.syncStatusColor,
          statusDetail: syncStatus.statusDetail,
          runId: syncStatus.activeRunId ?? syncStatus.latestRunId,
          lastSyncStartTime: syncStatus.lastSyncStartTime,
          lastSyncEndTime: syncStatus.lastSyncEndTime,
          lastSuccessfulSyncTime: syncStatus.lastSuccessfulSyncTime,
          recordsRetrieved: syncStatus.recordsRetrieved,
          recordsProcessed: syncStatus.recordsProcessed,
          recordsInserted: syncStatus.recordsInserted,
          recordsUpdated: syncStatus.recordsUpdated,
          recordsSkipped: syncStatus.recordsSkipped,
          recordsFailed: syncStatus.recordsFailed,
          totalRecordsExpected: syncStatus.totalRecordsExpected,
          currentPage: syncStatus.currentPage,
          currentCursor: syncStatus.currentCursor,
          errorSummary: syncStatus.errorSummary,
          completedSuccessfully: syncStatus.completedSuccessfully,
          canManageIntegration
        };
      }),
      summary: {
        totalIntegrations: rows.length,
        enabledIntegrations: enabled,
        failedJobs,
        last24hSyncActivity: last24hActivity
      },
      apiPaused: INTEGRATIONS_API_PAUSED
    };
  } catch (error) {
    if (!isMissingIntegrationsSchemaError(error)) throw error;
    return {
      integrations: [
        {
          integrationKey: GIVINGFUEL_INTEGRATION_KEY,
          name: GIVINGFUEL_INTEGRATION_NAME,
          providerType: "Contacts",
          description:
            "Webconnex API synchronization is available after migration 202603130021 is applied.",
          enabledStatus: "Disabled",
          connectionStatus: "Not Tested",
          isEnabled: false,
          syncStatus: "Could Not Complete",
          syncStatusColor: "red",
          statusDetail: "Migration required",
          runId: null,
          lastSyncStartTime: null,
          lastSyncEndTime: null,
          lastSuccessfulSyncTime: null,
          recordsRetrieved: 0,
          recordsProcessed: 0,
          recordsInserted: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
          totalRecordsExpected: null,
          currentPage: null,
          currentCursor: null,
          errorSummary: "Migration required",
          completedSuccessfully: false,
          canManageIntegration
        },
        {
          integrationKey: GIVINGFUEL_DONATIONS_INTEGRATION_KEY,
          name: GIVINGFUEL_DONATIONS_INTEGRATION_NAME,
          providerType: "Donations",
          description:
            "GivingFuel Donations API synchronization is available after migration 202603130021 is applied.",
          enabledStatus: "Disabled",
          connectionStatus: "Not Tested",
          isEnabled: false,
          syncStatus: "Could Not Complete",
          syncStatusColor: "red",
          statusDetail: "Migration required",
          runId: null,
          lastSyncStartTime: null,
          lastSyncEndTime: null,
          lastSuccessfulSyncTime: null,
          recordsRetrieved: 0,
          recordsProcessed: 0,
          recordsInserted: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
          totalRecordsExpected: null,
          currentPage: null,
          currentCursor: null,
          errorSummary: "Migration required",
          completedSuccessfully: false,
          canManageIntegration
        },
        {
          integrationKey: KINDFUL_INTEGRATION_KEY,
          name: KINDFUL_INTEGRATION_NAME,
          providerType: "Migration + Sync",
          description:
            "Kindful migration + transition synchronization is available after migration 202603130021 and 202603171500 are applied.",
          enabledStatus: "Disabled",
          connectionStatus: "Not Tested",
          isEnabled: false,
          syncStatus: "Could Not Complete",
          syncStatusColor: "red",
          statusDetail: "Migration required",
          runId: null,
          lastSyncStartTime: null,
          lastSyncEndTime: null,
          lastSuccessfulSyncTime: null,
          recordsRetrieved: 0,
          recordsProcessed: 0,
          recordsInserted: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
          totalRecordsExpected: null,
          currentPage: null,
          currentCursor: null,
          errorSummary: "Migration required",
          completedSuccessfully: false,
          canManageIntegration
        }
      ],
      summary: {
        totalIntegrations: 3,
        enabledIntegrations: 0,
        failedJobs: 0,
        last24hSyncActivity: 0
      },
      schemaWarning: INTEGRATIONS_SCHEMA_ERROR_MESSAGE,
      apiPaused: INTEGRATIONS_API_PAUSED
    };
  }
}

export async function getIntegrationDetailForAdmin(integrationKey: string) {
  const context = await requireIntegrationsManager();
  try {
    const { definition, connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    const safeConnection = sanitizeConnectionForUi(connection);
    const jobs = await logService.listJobs(context.organizationId, connection.id);
    const errors = await logService.listErrors(context.organizationId, connection.id);
    const [linkedContactsCount, crmContactsCountResult, crmPersonalContactsCountResult] = await Promise.all([
      countUniqueLinkedContacts({
        organizationId: context.organizationId,
        integrationKey
      }),
      createIntegrationClient().then((supabase) =>
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", context.organizationId)
      ),
      createIntegrationClient().then((supabase) =>
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", context.organizationId)
          .or("organization_name.is.null,organization_name.eq.")
      )
    ]);

    if (crmContactsCountResult.error) throw crmContactsCountResult.error;
    if (crmPersonalContactsCountResult.error) throw crmPersonalContactsCountResult.error;

    const lastSuccess = jobs.find(
      (job) => job.status === "completed" || job.status === "completed_with_errors"
    );
    const lastFailure = jobs.find((job) => job.status === "failed");
    const totalProcessedContacts = jobs.reduce(
      (sum, job) =>
        sum +
        (job.sync_scope === "contacts" || job.sync_scope === "all" ? Number(job.records_processed ?? 0) : 0),
      0
    );
    const totalSuccessfulUpserts = jobs.reduce(
      (sum, job) =>
        sum +
        (job.sync_scope === "contacts" || job.sync_scope === "all"
          ? Number(job.records_created ?? 0) + Number(job.records_updated ?? 0)
          : 0),
      0
    );

    return {
      definition,
      connection: safeConnection,
      jobs,
      errors,
      overview: {
        integrationName: safeConnection.name || definition.name,
        description: definition.description,
        currentStatus: safeConnection.is_enabled ? "Enabled" : "Disabled",
        connectionStatus: safeConnection.connection_status,
        lastSuccessfulSync: lastSuccess?.completed_date ?? null,
        lastFailedSync: lastFailure?.completed_date ?? null,
        lastSyncDurationMs: jobs[0]?.duration_ms ?? null,
        totalContactsSynced: linkedContactsCount,
        totalContactsProcessed: totalProcessedContacts,
        totalContactUpsertsSuccessful: totalSuccessfulUpserts,
        totalCrmContacts: crmContactsCountResult.count ?? 0,
        totalCrmPersonalContacts: crmPersonalContactsCountResult.count ?? 0,
        totalDonationsSynced: jobs.reduce(
          (sum, job) =>
            sum +
            (job.sync_scope === "donations" || job.sync_scope === "all"
              ? job.records_processed
              : 0),
          0
        ),
        failedRecordsCount: jobs.reduce(
          (sum, job) => sum + Number(job.records_failed ?? 0),
          0
        )
      },
      apiPaused: INTEGRATIONS_API_PAUSED
    };
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      return createFallbackDetail(integrationKey, context.organizationId);
    }
    if (error instanceof Error && error.message.includes("Integration")) {
      return createFallbackDetail(integrationKey, context.organizationId);
    }
    throw error;
  }
}

export async function updateIntegrationConfiguration(
  integrationKey: string,
  payload: {
    name?: string;
    baseUrl?: string;
    authType?: string;
    apiKeyReference?: string | null;
    isEnabled?: boolean;
    timeoutMs?: number;
    retrySettings?: Record<string, unknown>;
    debugLoggingEnabled?: boolean;
    configuration?: Record<string, unknown>;
    syncSettings?: Record<string, unknown>;
    fieldMapping?: Record<string, unknown>;
    apiKey?: string;
  }
) {
  const context = await requireIntegrationsManager();
  try {
    const definition = await registryService.getDefinition(integrationKey);
    if (!definition) throw new Error("Integration not found.");
    if (isGivingFuelIntegrationKey(integrationKey) || isKindfulIntegrationKey(integrationKey)) {
      const existing = await configurationService.getConnection(context.organizationId, definition);
      const existingConfig = (existing?.configuration_json ?? {}) as Record<string, unknown>;
      const existingHasApiKey =
        Boolean(existingConfig.encryptedApiKey) ||
        Boolean(existingConfig.apiKeyConfigured);
      const providedApiKey = payload.apiKey?.trim();
      if (!providedApiKey && !existingHasApiKey && payload.isEnabled !== false) {
        throw new Error(
          `API key is required before connecting ${integrationDisplayName(integrationKey)}.`
        );
      }
    }
    const normalizedPayload = isGivingFuelIntegrationKey(integrationKey)
      ? {
          ...payload,
          name: payload.name ?? integrationDisplayName(integrationKey),
          baseUrl: GIVINGFUEL_BASE_URL,
          authType: "api_key_header",
          apiKeyReference: null,
          configuration: {
            ...(payload.configuration ?? {}),
            contactsPath: GIVINGFUEL_CUSTOMERS_PATH,
            transactionsPath: GIVINGFUEL_TRANSACTIONS_PATH,
            formsPath: GIVINGFUEL_FORMS_PATH,
            testPath: GIVINGFUEL_CUSTOMERS_PATH,
            authHeaderName: GIVINGFUEL_API_HEADER_NAME,
            staticQueryParams: { product: GIVINGFUEL_PRODUCT_VALUE },
            defaultLimit: 100
          },
          syncSettings: {
            ...(payload.syncSettings ?? {}),
            contactSyncEnabled: integrationKey === GIVINGFUEL_INTEGRATION_KEY,
            donationSyncEnabled: integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY,
            fullSyncEnabled: false,
            fallbackContactMatch: "external_id_only"
          }
        }
      : isKindfulIntegrationKey(integrationKey)
        ? {
            ...payload,
            name: payload.name ?? integrationDisplayName(integrationKey),
            baseUrl: payload.baseUrl ?? KINDFUL_BASE_URL,
            authType: "api_key_header",
            apiKeyReference: null,
            configuration: {
              ...(payload.configuration ?? {}),
              contactsQueryPath: KINDFUL_CONTACTS_QUERY_PATH,
              transactionsQueryPath: KINDFUL_TRANSACTIONS_QUERY_PATH,
              notesPath: KINDFUL_NOTES_PATH,
              activitiesPath: KINDFUL_ACTIVITIES_PATH,
              syncStatusPath: KINDFUL_SYNC_STATUS_PATH,
              importStatusPathTemplate: KINDFUL_IMPORT_STATUS_PATH_TEMPLATE,
              authHeaderName: KINDFUL_AUTH_HEADER_NAME,
              authHeaderPrefix: KINDFUL_AUTH_HEADER_PREFIX,
              pageSize: KINDFUL_DEFAULT_PAGE_SIZE,
              requestIntervalMs: 200,
              environment: "production"
            },
            syncSettings: {
              ...(payload.syncSettings ?? {}),
              contactSyncEnabled: true,
              donationSyncEnabled: true,
              noteSyncEnabled: true,
              activitySyncEnabled: true,
              fullSyncEnabled: true,
              incrementalSyncEnabled: true,
              fallbackContactMatch: "email_phone_name_address"
            }
          }
        : payload;
    const connection = await configurationService.upsertConfiguration({
      organizationId: context.organizationId,
      userId: context.userId,
      definition,
      payload: normalizedPayload
    });
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "integration_configuration_updated",
      targetEntityType: "integration_connections",
      targetEntityId: connection.id,
      metadata: { integrationKey }
    });
    return sanitizeConnectionForUi(connection);
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
    }
    throw error;
  }
}

export async function testIntegrationConnection(
  integrationKey: string,
  apiKeyOverride?: string
) {
  const context = await requireIntegrationsManager();
  if (INTEGRATIONS_API_PAUSED) {
    throw new Error(INTEGRATIONS_API_PAUSED_MESSAGE);
  }
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    const result = isGivingFuelIntegrationKey(integrationKey)
      ? await webconnexSyncService.testConnection(connection, {
          apiKeyOverride: apiKeyOverride?.trim() || undefined,
          probeTransactions: integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY
        })
      : isKindfulIntegrationKey(integrationKey)
        ? await kindfulSyncService.testConnection(connection, {
            tokenOverride: apiKeyOverride?.trim() || undefined
          })
        : { ok: false, message: `No test connector implemented for ${integrationKey}.` };
    const supabase = await createIntegrationClient();
    await supabase
      .from("integration_connections")
      .update({
        connection_status: result.ok ? "connected" : "failed",
        last_connection_test_date: new Date().toISOString(),
        last_connection_test_result: result.message,
        updated_by: context.userId
      })
      .eq("organization_id", context.organizationId)
      .eq("id", connection.id);
    return result;
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      if (!isGivingFuelIntegrationKey(integrationKey) && !isKindfulIntegrationKey(integrationKey)) {
        throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
      }
      if (isKindfulIntegrationKey(integrationKey)) {
        throw new Error(
          "Integrations schema is required before testing Kindful. Run migrations 202603130021 and 202603171500."
        );
      }
      const schemaFreeConnection = buildSchemaFreeWebconnexConnection(context.organizationId, integrationKey);
      const result = await webconnexSyncService.testConnection(schemaFreeConnection, {
        apiKeyOverride: apiKeyOverride?.trim() || undefined,
        probeTransactions: integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY
      });
      return {
        ...result,
        message: result.ok
          ? `${result.message} (schema-free mode: using environment-backed Webconnex configuration)`
          : `${result.message} (schema-free mode: set WEBCONNEX_BASE_URL/WEBCONNEX_API_BASE_URL and WEBCONNEX_API_KEY)`
      };
    }
    throw error;
  }
}

export async function runIntegrationSync(integrationKey: string, scope: SyncScope) {
  const context = await requireIntegrationsManager();
  if (INTEGRATIONS_API_PAUSED) {
    throw new Error(INTEGRATIONS_API_PAUSED_MESSAGE);
  }
  if (integrationKey === GIVINGFUEL_INTEGRATION_KEY && scope !== "contacts") {
    throw new Error("GivingFuel Contacts integration currently supports contacts sync only.");
  }
  if (integrationKey === GIVINGFUEL_DONATIONS_INTEGRATION_KEY && scope !== "donations") {
    throw new Error("GivingFuel Donations integration currently supports donations sync only.");
  }
  try {
    const { definition, connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    const result = await jobRunner.run({
      organizationId: context.organizationId,
      userId: context.userId,
      definition,
      connection,
      scope,
      jobType: "manual"
    });
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "integration_manual_sync_run",
      targetEntityType: "integration_connections",
      targetEntityId: connection.id,
      metadata: { integrationKey, scope, ...result }
    });
    return result;
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
    }
    throw error;
  }
}

export async function retryFailedIntegrationSync(integrationKey: string) {
  const context = await requireIntegrationsManager();
  if (INTEGRATIONS_API_PAUSED) {
    throw new Error(INTEGRATIONS_API_PAUSED_MESSAGE);
  }
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    const result = await retryService.retryFailed({
      organizationId: context.organizationId,
      userId: context.userId,
      integrationKey,
      connection
    });
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "integration_retry_failed_run",
      targetEntityType: "integration_connections",
      targetEntityId: connection.id,
      metadata: { integrationKey, result }
    });
    return result;
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
    }
    throw error;
  }
}

export async function listIntegrationJobs(integrationKey: string): Promise<IntegrationSyncJob[]> {
  const context = await requireIntegrationsManager();
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    return logService.listJobs(context.organizationId, connection.id);
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getIntegrationJob(
  integrationKey: string,
  jobId: string
): Promise<{ job: IntegrationSyncJob | null; logs: Array<Record<string, unknown>> }> {
  const context = await requireIntegrationsManager();
  try {
    await getDefinitionAndConnection(context.organizationId, context.userId, integrationKey);
    const job = await logService.getJob(context.organizationId, jobId);
    const logs = await logService.listJobLogs(context.organizationId, jobId);
    return { job, logs };
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      return { job: null, logs: [] };
    }
    throw error;
  }
}

export async function listIntegrationErrors(
  integrationKey: string
): Promise<IntegrationErrorQueueItem[]> {
  const context = await requireIntegrationsManager();
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    return logService.listErrors(context.organizationId, connection.id);
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function resolveIntegrationError(integrationKey: string, errorId: string) {
  const context = await requireIntegrationsManager();
  try {
    const { connection } = await getDefinitionAndConnection(
      context.organizationId,
      context.userId,
      integrationKey
    );
    const supabase = await createIntegrationClient();
    const { data: queuedError, error: loadError } = await supabase
      .from("integration_error_queue")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", connection.id)
      .eq("id", errorId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!queuedError) {
      throw new Error("Error queue item not found.");
    }

    if (
      integrationKey === GIVINGFUEL_INTEGRATION_KEY &&
      String(queuedError.entity_type ?? "") === "contact"
    ) {
      const payload = queuedError.payload_json;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Retry payload is missing or invalid.");
      }

      const retryJob = await logService.createJob({
        organizationId: context.organizationId,
        integrationConnectionId: connection.id,
        jobType: "retry_failed",
        syncScope: "contacts",
        triggeredBy: context.userId,
        triggeredByType: "manual"
      });

      try {
        const retried = await contactSyncService.retrySingleRecord({
          organizationId: context.organizationId,
          connection,
          job: retryJob,
          record: payload as Record<string, unknown>,
          logService
        });

        await logService.completeJob({
          organizationId: context.organizationId,
          jobId: retryJob.id,
          status: "completed",
          recordsRetrieved: 1,
          recordsProcessed: 1,
          recordsCreated: retried.created,
          recordsUpdated: retried.updated,
          recordsSkipped: 0,
          recordsFailed: 0,
          totalRecordsExpected: 1,
          currentPage: 1,
          completedSuccessfully: true,
          pagingComplete: true,
          cursor: null,
          lastSuccessfulSyncDate: new Date().toISOString(),
          errorSummary: null,
          startedDate: retryJob.started_date
        });

        const { error: resolveError } = await supabase
          .from("integration_error_queue")
          .update({
            status: "resolved",
            next_retry_date: null,
            last_retry_date: new Date().toISOString(),
            retry_count: Number(queuedError.retry_count ?? 0) + 1
          })
          .eq("organization_id", context.organizationId)
          .eq("integration_connection_id", connection.id)
          .eq("id", errorId);
        if (resolveError) throw resolveError;

        await logAuditEvent({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          actionType: "integration_error_resolved",
          targetEntityType: "integration_error_queue",
          targetEntityId: errorId,
          metadata: {
            integrationKey,
            retryMode: "single_payload",
            sourceRecordId: retried.externalId
          }
        });

        return {
          ok: true,
          retried: true,
          message: "Retry succeeded and the contact was synchronized."
        };
      } catch (retryError) {
        const retryMessage =
          retryError instanceof Error ? retryError.message : "Retry failed for this error item.";

        await logService.completeJob({
          organizationId: context.organizationId,
          jobId: retryJob.id,
          status: "failed",
          recordsRetrieved: 1,
          recordsProcessed: 1,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsSkipped: 0,
          recordsFailed: 1,
          totalRecordsExpected: 1,
          currentPage: 1,
          completedSuccessfully: false,
          pagingComplete: false,
          cursor: null,
          lastSuccessfulSyncDate: null,
          errorSummary: retryMessage,
          startedDate: retryJob.started_date
        });

        await supabase
          .from("integration_error_queue")
          .update({
            status: "open",
            next_retry_date: null,
            last_retry_date: new Date().toISOString(),
            retry_count: Number(queuedError.retry_count ?? 0) + 1,
            error_message: retryMessage
          })
          .eq("organization_id", context.organizationId)
          .eq("integration_connection_id", connection.id)
          .eq("id", errorId);

        throw new Error(`Retry failed: ${retryMessage}`);
      }
    }

    const { error } = await supabase
      .from("integration_error_queue")
      .update({
        status: "resolved",
        next_retry_date: null,
        last_retry_date: new Date().toISOString()
      })
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", connection.id)
      .eq("id", errorId);
    if (error) throw error;
    await logAuditEvent({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actionType: "integration_error_resolved",
      targetEntityType: "integration_error_queue",
      targetEntityId: errorId,
      metadata: { integrationKey, retryMode: "mark_only" }
    });
    return { ok: true, retried: false, message: "Error marked as resolved." };
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) {
      throw new Error(INTEGRATIONS_SCHEMA_ERROR_MESSAGE);
    }
    throw error;
  }
}

export function integrationsApiPaused() {
  return INTEGRATIONS_API_PAUSED;
}

export async function listRecentSyncedContactsForIntegration(
  integrationKey: string,
  limit = 20
): Promise<RecentSyncedContactRow[]> {
  const context = await requireIntegrationsManager();
  const boundedLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 20;
  try {
    await getDefinitionAndConnection(context.organizationId, context.userId, integrationKey);
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("contact_external_references")
      .select(
        "external_record_id, source_system, last_synced_date, contacts(id, first_name, last_name, email, phone, city, state, updated_at)"
      )
      .eq("organization_id", context.organizationId)
      .in(
        "source_system",
        isGivingFuelIntegrationKey(integrationKey) ? ["givingfuel", "webconnex"] : [integrationKey]
      )
      .order("last_synced_date", { ascending: false })
      .limit(boundedLimit);
    if (error) {
      // Backward compatibility: older rows may have webconnex source_system.
      if (isGivingFuelIntegrationKey(integrationKey) && (error.code === "PGRST116" || error.code === "PGRST205")) {
        return [];
      }
      throw error;
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const contact = (Array.isArray(row.contacts) ? row.contacts[0] : row.contacts) as
        | Record<string, unknown>
        | null
        | undefined;
      return {
        externalRecordId: String(row.external_record_id ?? ""),
        lastSyncedDate:
          typeof row.last_synced_date === "string" ? row.last_synced_date : null,
        sourceSystem: String(row.source_system ?? ""),
        contact: {
          id: String(contact?.id ?? ""),
          firstName: String(contact?.first_name ?? ""),
          lastName: String(contact?.last_name ?? ""),
          email: String(contact?.email ?? ""),
          phone: String(contact?.phone ?? ""),
          city: String(contact?.city ?? ""),
          state: String(contact?.state ?? ""),
          updatedAt:
            typeof contact?.updated_at === "string" ? String(contact.updated_at) : null
        }
      };
    });
  } catch (error) {
    if (isMissingIntegrationsSchemaError(error)) return [];
    throw error;
  }
}

async function getDonationIntegrationContext(integrationKey: string) {
  if (integrationKey !== GIVINGFUEL_DONATIONS_INTEGRATION_KEY) {
    throw new Error("Donation page mappings are available for GivingFuel Donations only.");
  }
  const context = await requireIntegrationsManager();
  const { connection } = await getDefinitionAndConnection(
    context.organizationId,
    context.userId,
    integrationKey
  );
  return { ...context, connection };
}

export async function listDonationPageMappingsForIntegration(integrationKey: string) {
  const context = await getDonationIntegrationContext(integrationKey);
  const supabase = await createIntegrationClient();

  const [mappingsResult, campaignsResult, subCampaignsResult] = await Promise.all([
    supabase
      .from("integration_donation_page_mappings")
      .select(
        "id, external_page_value, mapped_campaign_id, mapped_sub_campaign_id, status, first_detected_at, last_detected_at"
      )
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", context.connection.id)
      .order("status", { ascending: false })
      .order("external_page_value", { ascending: true }),
    supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("organization_id", context.organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("sub_campaigns")
      .select("id, campaign_id, name, status, external_page_key")
      .eq("organization_id", context.organizationId)
      .order("name", { ascending: true })
  ]);

  if (mappingsResult.error) throw mappingsResult.error;
  if (campaignsResult.error) throw campaignsResult.error;
  if (subCampaignsResult.error) throw subCampaignsResult.error;

  const mappings = (mappingsResult.data ?? []).map((row) => {
    const mappedCampaignId =
      typeof row.mapped_campaign_id === "string" ? row.mapped_campaign_id : null;
    const mappedSubCampaignId =
      typeof row.mapped_sub_campaign_id === "string" ? row.mapped_sub_campaign_id : null;
    return {
      id: String(row.id),
      externalPageValue: String(row.external_page_value ?? ""),
      status: mappedCampaignId ? "mapped" : "unmapped",
      mappedCampaignId,
      mappedSubCampaignId,
      firstDetectedAt:
        typeof row.first_detected_at === "string" ? String(row.first_detected_at) : null,
      lastDetectedAt: typeof row.last_detected_at === "string" ? String(row.last_detected_at) : null
    } satisfies DonationPageMappingRow;
  });

  return {
    mappings,
    campaigns: (campaignsResult.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      status: String(row.status ?? "")
    })),
    subCampaigns: (subCampaignsResult.data ?? []).map((row) => ({
      id: String(row.id),
      campaignId: String(row.campaign_id ?? ""),
      name: String(row.name ?? ""),
      status: String(row.status ?? ""),
      externalPageKey: String(row.external_page_key ?? "")
    })),
    summary: {
      total: mappings.length,
      mapped: mappings.filter((row) => row.status === "mapped").length,
      unmapped: mappings.filter((row) => row.status === "unmapped").length
    }
  };
}

export async function upsertDonationPageMappingForIntegration(
  integrationKey: string,
  payload: {
    externalPageValue: string;
    campaignId: string | null;
    subCampaignId?: string | null;
  }
) {
  const context = await getDonationIntegrationContext(integrationKey);
  const supabase = await createIntegrationClient();
  const externalPageValue = payload.externalPageValue.trim();
  if (!externalPageValue) throw new Error("External page value is required.");
  if (!payload.campaignId) throw new Error("Campaign is required for mapping.");

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", payload.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) throw new Error("Selected campaign was not found.");

  if (payload.subCampaignId) {
    const { data: subCampaign, error: subCampaignError } = await supabase
      .from("sub_campaigns")
      .select("id, campaign_id")
      .eq("organization_id", context.organizationId)
      .eq("id", payload.subCampaignId)
      .maybeSingle();
    if (subCampaignError) throw subCampaignError;
    if (!subCampaign) throw new Error("Selected sub-campaign was not found.");
    if (String(subCampaign.campaign_id) !== payload.campaignId) {
      throw new Error("Selected sub-campaign does not belong to the selected campaign.");
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("integration_donation_page_mappings")
    .upsert(
      {
        organization_id: context.organizationId,
        integration_connection_id: context.connection.id,
        external_page_value: externalPageValue,
        mapped_campaign_id: payload.campaignId,
        mapped_sub_campaign_id: payload.subCampaignId ?? null,
        status: "mapped",
        last_detected_at: now,
        updated_by: context.userId
      },
      { onConflict: "organization_id,integration_connection_id,external_page_value" }
    )
    .select(
      "id, external_page_value, mapped_campaign_id, mapped_sub_campaign_id, status, first_detected_at, last_detected_at"
    )
    .single();
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "integration_page_mapping_updated",
    targetEntityType: "integration_donation_page_mappings",
    targetEntityId: String(data.id),
    metadata: {
      integrationKey,
      externalPageValue,
      campaignId: payload.campaignId,
      subCampaignId: payload.subCampaignId ?? null
    }
  });

  return {
    id: String(data.id),
    externalPageValue: String(data.external_page_value ?? ""),
    status: "mapped" as const,
    mappedCampaignId: String(data.mapped_campaign_id ?? ""),
    mappedSubCampaignId:
      typeof data.mapped_sub_campaign_id === "string" ? String(data.mapped_sub_campaign_id) : null,
    firstDetectedAt:
      typeof data.first_detected_at === "string" ? String(data.first_detected_at) : null,
    lastDetectedAt: typeof data.last_detected_at === "string" ? String(data.last_detected_at) : null
  } satisfies DonationPageMappingRow;
}

export async function detectDonationPagesForIntegration(
  integrationKey: string,
  input?: { maxPages?: number }
) {
  const context = await getDonationIntegrationContext(integrationKey);
  const supabase = await createIntegrationClient();
  const existing = await supabase
    .from("integration_donation_page_mappings")
    .select("external_page_value")
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", context.connection.id);
  if (existing.error) throw existing.error;
  const existingValues = new Set(
    (existing.data ?? []).map((row) => String(row.external_page_value ?? "").trim()).filter(Boolean)
  );

  const detected = await webconnexSyncService.detectDonationPages({
    connection: context.connection,
    maxPages: input?.maxPages
  });

  const now = new Date().toISOString();
  for (const pageValue of detected.detectedPages) {
    if (!pageValue.trim()) continue;
    const { error } = await supabase.from("integration_donation_page_mappings").upsert(
      {
        organization_id: context.organizationId,
        integration_connection_id: context.connection.id,
        external_page_value: pageValue.trim(),
        last_detected_at: now,
        updated_by: context.userId
      },
      { onConflict: "organization_id,integration_connection_id,external_page_value" }
    );
    if (error) throw error;
  }

  const newlyDetected = detected.detectedPages.filter((pageValue) => !existingValues.has(pageValue)).length;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "integration_page_values_detected",
    targetEntityType: "integration_connections",
    targetEntityId: context.connection.id,
    metadata: {
      integrationKey,
      detectedCount: detected.detectedPages.length,
      newlyDetected,
      pagesScanned: detected.pagesScanned,
      transactionsScanned: detected.transactionsScanned
    }
  });

  return {
    ...detected,
    newlyDetected
  };
}

export async function createSubCampaignForIntegration(
  integrationKey: string,
  input: {
    campaignId: string;
    name: string;
    description?: string;
    status?: "Active" | "Inactive";
    externalPageKey?: string;
  }
) {
  const context = await getDonationIntegrationContext(integrationKey);
  const supabase = await createIntegrationClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", input.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) throw new Error("Campaign not found.");

  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error("Sub-campaign name is required.");

  const { data, error } = await supabase
    .from("sub_campaigns")
    .insert({
      organization_id: context.organizationId,
      campaign_id: input.campaignId,
      name: trimmedName,
      description: input.description?.trim() || null,
      status: input.status ?? "Active",
      external_page_key: input.externalPageKey?.trim() || null,
      created_by: context.userId,
      updated_by: context.userId
    })
    .select("id, campaign_id, name, description, status, external_page_key")
    .single();
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "sub_campaign_created",
    targetEntityType: "sub_campaigns",
    targetEntityId: String(data.id),
    metadata: {
      integrationKey,
      campaignId: input.campaignId
    }
  });

  return {
    id: String(data.id),
    campaignId: String(data.campaign_id ?? ""),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    status: String(data.status ?? ""),
    externalPageKey: String(data.external_page_key ?? "")
  };
}

type KindfulReviewQueueItem = {
  id: string;
  entityType: string;
  sourceRecordId: string | null;
  reason: string;
  confidenceScore: number | null;
  resolutionStatus: string;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  candidateMatches: Array<Record<string, unknown>>;
};

type KindfulDeadLetterQueueItem = {
  id: string;
  entityType: string;
  sourceRecordId: string | null;
  errorMessage: string;
  retryable: boolean;
  retryCount: number;
  status: string;
  lastRetryDate: string | null;
  createdAt: string;
};

async function getKindfulContext(integrationKey = KINDFUL_INTEGRATION_KEY) {
  if (!isKindfulIntegrationKey(integrationKey)) {
    throw new Error("Kindful-only operation requested for a non-Kindful integration key.");
  }
  const context = await requireIntegrationsManager();
  const { definition, connection } = await getDefinitionAndConnection(
    context.organizationId,
    context.userId,
    integrationKey
  );
  return { ...context, definition, connection };
}

export async function listKindfulReviewQueue(
  integrationKey: string,
  status: "open" | "resolved" | "all" = "open"
) {
  const context = await getKindfulContext(integrationKey);
  const supabase = await createIntegrationClient();
  let query = supabase
    .from("integration_review_queue")
    .select(
      "id, entity_type, source_record_id, reason, confidence_score, resolution_status, resolution_notes, resolved_at, created_at, candidate_matches"
    )
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", context.connection.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status === "open") {
    query = query.neq("resolution_status", "resolved");
  } else if (status === "resolved") {
    query = query.eq("resolution_status", "resolved");
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    entityType: String(row.entity_type ?? ""),
    sourceRecordId: typeof row.source_record_id === "string" ? row.source_record_id : null,
    reason: String(row.reason ?? ""),
    confidenceScore:
      typeof row.confidence_score === "number" ? Number(row.confidence_score) : null,
    resolutionStatus: String(row.resolution_status ?? "open"),
    resolutionNotes:
      typeof row.resolution_notes === "string" ? String(row.resolution_notes) : null,
    resolvedAt: typeof row.resolved_at === "string" ? String(row.resolved_at) : null,
    createdAt: String(row.created_at ?? ""),
    candidateMatches: Array.isArray(row.candidate_matches)
      ? (row.candidate_matches as Array<Record<string, unknown>>)
      : []
  })) as KindfulReviewQueueItem[];
}

export async function resolveKindfulReviewQueueItem(input: {
  integrationKey: string;
  reviewId: string;
  resolutionNotes?: string;
}) {
  const context = await getKindfulContext(input.integrationKey);
  const supabase = await createIntegrationClient();
  const { error } = await supabase
    .from("integration_review_queue")
    .update({
      resolution_status: "resolved",
      resolution_notes: input.resolutionNotes?.trim() || null,
      resolved_by: context.userId,
      resolved_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", context.connection.id)
    .eq("id", input.reviewId);
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "integration_review_queue_resolved",
    targetEntityType: "integration_review_queue",
    targetEntityId: input.reviewId,
    metadata: {
      integrationKey: KINDFUL_INTEGRATION_KEY
    }
  });
  return { ok: true };
}

export async function listKindfulDeadLetterQueue(
  integrationKey: string,
  status: "open" | "replayed" | "resolved" | "all" = "open"
) {
  const context = await getKindfulContext(integrationKey);
  const supabase = await createIntegrationClient();
  let query = supabase
    .from("integration_dead_letter_queue")
    .select(
      "id, entity_type, source_record_id, error_message, retryable, retry_count, status, last_retry_date, created_at"
    )
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", context.connection.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    entityType: String(row.entity_type ?? ""),
    sourceRecordId: typeof row.source_record_id === "string" ? row.source_record_id : null,
    errorMessage: String(row.error_message ?? ""),
    retryable: Boolean(row.retryable),
    retryCount: Number(row.retry_count ?? 0),
    status: String(row.status ?? "open"),
    lastRetryDate: typeof row.last_retry_date === "string" ? String(row.last_retry_date) : null,
    createdAt: String(row.created_at ?? "")
  })) as KindfulDeadLetterQueueItem[];
}

export async function replayKindfulDeadLetterItem(integrationKey: string, deadLetterId: string) {
  const context = await getKindfulContext(integrationKey);
  const supabase = await createIntegrationClient();
  const { data: row, error: rowError } = await supabase
    .from("integration_dead_letter_queue")
    .select("id, status, retry_count")
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", context.connection.id)
    .eq("id", deadLetterId)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row) throw new Error("Dead-letter queue item not found.");

  const { error: updateError } = await supabase
    .from("integration_dead_letter_queue")
    .update({
      status: "replayed",
      retry_count: Number(row.retry_count ?? 0) + 1,
      last_retry_date: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("integration_connection_id", context.connection.id)
    .eq("id", deadLetterId);
  if (updateError) throw updateError;

  const result = await jobRunner.run({
    organizationId: context.organizationId,
    userId: context.userId,
    definition: context.definition,
    connection: context.connection,
    scope: "all",
    jobType: "retry_failed"
  });

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "integration_dead_letter_replayed",
    targetEntityType: "integration_dead_letter_queue",
    targetEntityId: deadLetterId,
    metadata: {
      integrationKey: KINDFUL_INTEGRATION_KEY,
      replayJobId: result.jobId
    }
  });

  return {
    ok: true,
    replayJobId: result.jobId,
    status: result.status
  };
}

export async function getKindfulCutoverReadiness(
  integrationKey: string,
  input?: { quietDays?: number }
) {
  const context = await getKindfulContext(integrationKey);
  const supabase = await createIntegrationClient();
  const quietDays = Math.max(1, Math.min(Number(input?.quietDays ?? 7), 90));

  const [
    contactsExternalCount,
    contactsExternalFallback,
    transactionsExternalCount,
    transactionsExternalFallback,
    integrationErrorsOpen,
    deadLetterOpen,
    reviewOpen,
    lastKindfulPayload,
    latestReport
  ] = await Promise.all([
    supabase
      .from("contact_external_ids")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("source_system", "kindful")
      .eq("is_active", true),
    supabase
      .from("contact_external_references")
      .select("contact_id")
      .eq("organization_id", context.organizationId)
      .eq("source_system", "kindful"),
    supabase
      .from("transaction_external_ids")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("source_system", "kindful")
      .eq("is_active", true),
    supabase
      .from("donation_external_references")
      .select("donation_id")
      .eq("organization_id", context.organizationId)
      .eq("source_system", "kindful"),
    supabase
      .from("integration_error_queue")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", context.connection.id)
      .neq("status", "resolved"),
    supabase
      .from("integration_dead_letter_queue")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", context.connection.id)
      .eq("status", "open"),
    supabase
      .from("integration_review_queue")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", context.connection.id)
      .neq("resolution_status", "resolved"),
    supabase
      .from("raw_source_payloads")
      .select("ingested_at")
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", context.connection.id)
      .eq("source_system", "kindful")
      .order("ingested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("integration_cutover_reports")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("integration_connection_id", context.connection.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (contactsExternalCount.error) throw contactsExternalCount.error;
  if (contactsExternalFallback.error) throw contactsExternalFallback.error;
  if (transactionsExternalCount.error) throw transactionsExternalCount.error;
  if (transactionsExternalFallback.error) throw transactionsExternalFallback.error;
  if (integrationErrorsOpen.error) throw integrationErrorsOpen.error;
  if (deadLetterOpen.error) throw deadLetterOpen.error;
  if (reviewOpen.error) throw reviewOpen.error;
  if (lastKindfulPayload.error) throw lastKindfulPayload.error;
  if (latestReport.error) throw latestReport.error;

  const fallbackContactIds = new Set(
    ((contactsExternalFallback.data ?? []) as Array<{ contact_id?: string | null }>)
      .map((row) => String(row.contact_id ?? ""))
      .filter(Boolean)
  );
  const fallbackDonationIds = new Set(
    ((transactionsExternalFallback.data ?? []) as Array<{ donation_id?: string | null }>)
      .map((row) => String(row.donation_id ?? ""))
      .filter(Boolean)
  );

  const contactsImported = Math.max(
    Number(contactsExternalCount.count ?? 0),
    fallbackContactIds.size
  );
  const transactionsImported = Math.max(
    Number(transactionsExternalCount.count ?? 0),
    fallbackDonationIds.size
  );
  const openFailedQueue =
    Number(integrationErrorsOpen.count ?? 0) + Number(deadLetterOpen.count ?? 0);
  const openReviewQueue = Number(reviewOpen.count ?? 0);
  const lastKindfulChangeAt =
    typeof lastKindfulPayload.data?.ingested_at === "string"
      ? String(lastKindfulPayload.data.ingested_at)
      : null;
  const lastChangeMs = lastKindfulChangeAt ? new Date(lastKindfulChangeAt).getTime() : null;
  const daysSinceLastKindfulChange =
    typeof lastChangeMs === "number" && Number.isFinite(lastChangeMs)
      ? Math.floor((Date.now() - lastChangeMs) / (24 * 60 * 60 * 1000))
      : null;
  const readyToCutover =
    openFailedQueue === 0 &&
    openReviewQueue === 0 &&
    (daysSinceLastKindfulChange === null || daysSinceLastKindfulChange >= quietDays);

  return {
    integrationKey: KINDFUL_INTEGRATION_KEY,
    contactsImported,
    transactionsImported,
    openFailedQueue,
    openReviewQueue,
    lastKindfulOnlyChangeAt: lastKindfulChangeAt,
    daysSinceLastKindfulChange,
    quietDaysTarget: quietDays,
    readyToCutover,
    latestReport: latestReport.data ?? null
  };
}

export async function approveKindfulCutover(
  integrationKey: string,
  input?: { notes?: string; quietDays?: number }
) {
  const context = await getKindfulContext(integrationKey);
  const readiness = await getKindfulCutoverReadiness(integrationKey, {
    quietDays: input?.quietDays
  });
  if (!readiness.readyToCutover) {
    throw new Error(
      "Kindful cutover readiness checks are not yet satisfied. Resolve queue items or wait for quiet period."
    );
  }
  const supabase = await createIntegrationClient();
  const now = new Date().toISOString();

  const reportInsert = await supabase
    .from("integration_cutover_reports")
    .insert({
      organization_id: context.organizationId,
      integration_connection_id: context.connection.id,
      source_system: "kindful",
      report_status: "approved",
      contacts_with_external_ids: readiness.contactsImported,
      transactions_with_external_ids: readiness.transactionsImported,
      open_failed_queue_count: readiness.openFailedQueue,
      open_review_queue_count: readiness.openReviewQueue,
      last_kindful_only_change_at: readiness.lastKindfulOnlyChangeAt,
      reconciliation_summary: {
        approvedNotes: input?.notes ?? null,
        readyToCutover: readiness.readyToCutover,
        approvedAt: now
      },
      approved_by: context.userId,
      approved_at: now
    })
    .select("id")
    .single();
  if (reportInsert.error) throw reportInsert.error;

  const nextSyncSettings = {
    ...(context.connection.sync_settings_json ?? {}),
    kindfulCutoverApprovedAt: now,
    kindfulCutoverApprovedBy: context.userId,
    kindfulCutoverNotes: input?.notes ?? null
  };
  const updateConnection = await supabase
    .from("integration_connections")
    .update({
      is_enabled: false,
      sync_settings_json: nextSyncSettings,
      updated_by: context.userId
    })
    .eq("organization_id", context.organizationId)
    .eq("id", context.connection.id);
  if (updateConnection.error) throw updateConnection.error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "integration_cutover_approved",
    targetEntityType: "integration_connections",
    targetEntityId: context.connection.id,
    metadata: {
      integrationKey,
      reportId: reportInsert.data?.id ?? null,
      notes: input?.notes ?? null
    }
  });

  return {
    ok: true,
    reportId: String(reportInsert.data?.id ?? ""),
    integrationFrozen: true
  };
}
