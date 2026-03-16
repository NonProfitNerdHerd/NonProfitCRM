import { Card, CardHeader } from "@/components/ui/card";
import { IntegrationsDashboard } from "@/components/admin/integrations/integrations-dashboard";
import { listIntegrationsForAdmin } from "@/lib/data/integrations";

export default async function IntegrationsPage() {
  let integrations: Array<{
    integrationKey: string;
    name: string;
    description?: string | null;
    connectionStatus?: string;
    enabledStatus?: string;
    isEnabled?: boolean;
    syncStatus?: "Fully Synced" | "Currently Working" | "Could Not Complete";
    syncStatusColor?: "green" | "yellow" | "red";
    statusDetail?: string;
    runId?: string | null;
    lastSyncStartTime?: string | null;
    lastSyncEndTime?: string | null;
    lastSuccessfulSyncTime?: string | null;
    recordsRetrieved?: number;
    recordsProcessed?: number;
    recordsInserted?: number;
    recordsUpdated?: number;
    recordsSkipped?: number;
    recordsFailed?: number;
    totalRecordsExpected?: number | null;
    currentPage?: number | null;
    currentCursor?: string | null;
    errorSummary?: string | null;
    completedSuccessfully?: boolean;
  }> = [];
  let apiPaused = false;
  let loadError: string | null = null;

  try {
    const result = await listIntegrationsForAdmin();
    integrations = result.integrations.map((item) => ({
      integrationKey: item.integrationKey,
      name: item.name,
      description: item.description,
      connectionStatus: item.connectionStatus,
      enabledStatus: item.enabledStatus,
      isEnabled: item.isEnabled,
      syncStatus: item.syncStatus as "Fully Synced" | "Currently Working" | "Could Not Complete",
      syncStatusColor: item.syncStatusColor as "green" | "yellow" | "red",
      statusDetail: item.statusDetail,
      runId: item.runId,
      lastSyncStartTime: item.lastSyncStartTime,
      lastSyncEndTime: item.lastSyncEndTime,
      lastSuccessfulSyncTime: item.lastSuccessfulSyncTime,
      recordsRetrieved: item.recordsRetrieved,
      recordsProcessed: item.recordsProcessed,
      recordsInserted: item.recordsInserted,
      recordsUpdated: item.recordsUpdated,
      recordsSkipped: item.recordsSkipped,
      recordsFailed: item.recordsFailed,
      totalRecordsExpected: item.totalRecordsExpected,
      currentPage: item.currentPage,
      currentCursor: item.currentCursor,
      errorSummary: item.errorSummary,
      completedSuccessfully: item.completedSuccessfully
    }));
    apiPaused = Boolean((result as { apiPaused?: boolean }).apiPaused);
    loadError = (result as { schemaWarning?: string }).schemaWarning ?? null;
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Integrations are temporarily unavailable in this environment.";
    integrations = [
      {
        integrationKey: "webconnex",
        name: "GivingFuel Contacts",
        description: "Sync GivingFuel contacts via Webconnex API.",
        connectionStatus: "Not Tested",
        enabledStatus: "Disabled",
        isEnabled: false,
        syncStatus: "Could Not Complete",
        syncStatusColor: "red",
        statusDetail: "Integrations schema is unavailable in this environment.",
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
        completedSuccessfully: false
      },
      {
        integrationKey: "givingfuel_donations",
        name: "GivingFuel Donations",
        description: "Sync GivingFuel donations via Webconnex API.",
        connectionStatus: "Not Tested",
        enabledStatus: "Disabled",
        isEnabled: false,
        syncStatus: "Could Not Complete",
        syncStatusColor: "red",
        statusDetail: "Integrations schema is unavailable in this environment.",
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
        completedSuccessfully: false
      }
    ];
    apiPaused = true;
  }

  return (
    <Card>
      <CardHeader
        title="Integrations"
        subtitle="Manage third-party providers, connection settings, and sync operations"
      />
      {loadError ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {loadError}
        </p>
      ) : null}
      <IntegrationsDashboard initialIntegrations={integrations} apiPaused={apiPaused} />
    </Card>
  );
}
