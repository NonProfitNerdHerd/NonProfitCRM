import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationDefinition } from "@/lib/integrations/types";
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
import { encryptIntegrationSecret } from "@/lib/integrations/secrets";

const DEFAULT_WEBCONNEX_FIELD_MAPPING = {
  contacts: {
    externalContactId: "id",
    firstName: "first_name",
    lastName: "last_name",
    email: "email",
    phone: "phone",
    addressLine1: "address_line_1",
    city: "city",
    state: "state",
    postalCode: "postal_code"
  },
  donations: {
    externalTransactionId: "id",
    externalContactId: "customerId",
    pageValue: ["Page Name", "formName", "pageName", "form_name", "page_name"],
    amount: "total",
    donationDate: "dateCreated",
    paymentMethod: "paymentMethod",
    status: "status",
    campaignName: "formName",
    subCampaignName: "formAccRef",
    campaign: "formName",
    notes: "gatewayMessage"
  }
};

const DEFAULT_CONTACTS_SYNC_SETTINGS = {
  syncMode: "manual_and_scheduled",
  scheduleFrequency: "daily",
  contactSyncEnabled: true,
  donationSyncEnabled: false,
  fullSyncEnabled: false,
  incrementalSyncEnabled: true,
  fallbackContactMatch: "external_id_only",
  initialImportStartDate: null,
  lastSuccessfulSyncDate: null,
  contactsCursor: null,
  donationsCursor: null
};

const DEFAULT_DONATIONS_SYNC_SETTINGS = {
  syncMode: "manual_and_scheduled",
  scheduleFrequency: "daily",
  contactSyncEnabled: false,
  donationSyncEnabled: true,
  fullSyncEnabled: false,
  incrementalSyncEnabled: true,
  fallbackContactMatch: "external_id_only",
  initialImportStartDate: null,
  lastSuccessfulSyncDate: null,
  contactsCursor: null,
  donationsCursor: null
};

const DEFAULT_KINDFUL_FIELD_MAPPING = {
  contacts: {
    externalContactId: ["id", "external_id", "contact.id", "contact.external_id"],
    firstName: ["first_name", "firstName", "contact.first_name"],
    lastName: ["last_name", "lastName", "contact.last_name"],
    email: ["email", "primary_email", "contact.email"],
    phone: ["phone", "mobile_phone", "contact.phone"],
    addressLine1: ["address_line_1", "address.street1", "contact.address.street1"],
    city: ["city", "address.city", "contact.address.city"],
    state: ["state", "address.state", "contact.address.state"],
    postalCode: ["postal_code", "zip", "address.postal_code", "contact.address.postal_code"]
  },
  donations: {
    externalTransactionId: ["id", "external_id", "transaction.id", "transaction.external_id"],
    externalContactId: ["contact_id", "contact.id", "contact.external_id", "donor_id"],
    amountInCents: ["amount_in_cents", "transaction.amount_in_cents"],
    amount: ["amount", "transaction.amount"],
    donationDate: ["transaction_time", "created_at", "updated_at"],
    paymentMethod: ["payment_method", "payment_type", "payment"],
    status: ["status"],
    campaignName: ["campaign.name", "campaign", "transaction.campaign.name"],
    campaignId: ["campaign.id", "transaction.campaign.id"],
    fundName: ["fund.name", "fund", "transaction.fund.name"],
    fundId: ["fund.id", "transaction.fund.id"],
    notes: ["note", "memo", "description"]
  }
};

const DEFAULT_KINDFUL_SYNC_SETTINGS = {
  syncMode: "manual_and_scheduled",
  scheduleFrequency: "hourly",
  contactSyncEnabled: true,
  donationSyncEnabled: true,
  noteSyncEnabled: true,
  activitySyncEnabled: true,
  fullSyncEnabled: true,
  incrementalSyncEnabled: true,
  fallbackContactMatch: "email_phone_name_address",
  initialImportStartDate: null,
  lastSuccessfulSyncDate: null,
  kindfulContactsMode: "backfill",
  kindfulTransactionsMode: "backfill",
  kindfulNotesMode: "backfill",
  kindfulActivitiesMode: "backfill",
  kindfulContactsQueryToken: null,
  kindfulTransactionsQueryToken: null,
  kindfulNotesQueryToken: null,
  kindfulActivitiesQueryToken: null,
  kindfulLastNotesSyncDate: null,
  kindfulLastActivitiesSyncDate: null
};

function defaultConnectionName(definition: IntegrationDefinition) {
  if (definition.provider_key === GIVINGFUEL_INTEGRATION_KEY) return GIVINGFUEL_INTEGRATION_NAME;
  if (definition.provider_key === GIVINGFUEL_DONATIONS_INTEGRATION_KEY) {
    return GIVINGFUEL_DONATIONS_INTEGRATION_NAME;
  }
  if (definition.provider_key === KINDFUL_INTEGRATION_KEY) return KINDFUL_INTEGRATION_NAME;
  return definition.name;
}

export class IntegrationConfigurationService {
  async getConnection(
    organizationId: string,
    definition: IntegrationDefinition
  ): Promise<IntegrationConnection | null> {
    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_connections")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("integration_definition_id", definition.id)
      .maybeSingle();
    if (error) throw error;
    return (data as IntegrationConnection | null) ?? null;
  }

  async ensureConnection(
    organizationId: string,
    userId: string,
    definition: IntegrationDefinition
  ): Promise<IntegrationConnection> {
    const existing = await this.getConnection(organizationId, definition);
    if (existing) return existing;

    const supabase = await createIntegrationClient();
    const { data, error } = await supabase
      .from("integration_connections")
      .insert({
        organization_id: organizationId,
        integration_definition_id: definition.id,
        name: defaultConnectionName(definition),
        base_url: isGivingFuelIntegrationKey(definition.provider_key)
          ? GIVINGFUEL_BASE_URL
          : isKindfulIntegrationKey(definition.provider_key)
            ? KINDFUL_BASE_URL
            : null,
        auth_type: "api_key_header",
        api_key_reference: null,
        is_enabled: false,
        connection_status: "not_tested",
        timeout_ms: 30000,
        retry_settings: { maxRetries: 3, backoffMs: 1000 },
        debug_logging_enabled: false,
        configuration_json:
          isGivingFuelIntegrationKey(definition.provider_key)
            ? {
                contactsPath: GIVINGFUEL_CUSTOMERS_PATH,
                transactionsPath: GIVINGFUEL_TRANSACTIONS_PATH,
                formsPath: GIVINGFUEL_FORMS_PATH,
                testPath: GIVINGFUEL_CUSTOMERS_PATH,
                authHeaderName: GIVINGFUEL_API_HEADER_NAME,
                staticQueryParams: { product: GIVINGFUEL_PRODUCT_VALUE },
                apiKeyConfigured: false
              }
            : isKindfulIntegrationKey(definition.provider_key)
              ? {
                  contactsQueryPath: KINDFUL_CONTACTS_QUERY_PATH,
                  transactionsQueryPath: KINDFUL_TRANSACTIONS_QUERY_PATH,
                  notesPath: KINDFUL_NOTES_PATH,
                  activitiesPath: KINDFUL_ACTIVITIES_PATH,
                  syncStatusPath: KINDFUL_SYNC_STATUS_PATH,
                  importStatusPathTemplate: KINDFUL_IMPORT_STATUS_PATH_TEMPLATE,
                  testPath: KINDFUL_SYNC_STATUS_PATH,
                  authHeaderName: KINDFUL_AUTH_HEADER_NAME,
                  authHeaderPrefix: KINDFUL_AUTH_HEADER_PREFIX,
                  pageSize: KINDFUL_DEFAULT_PAGE_SIZE,
                  requestIntervalMs: 200,
                  apiKeyConfigured: false,
                  environment: "production"
                }
            : {},
        sync_settings_json:
          definition.provider_key === GIVINGFUEL_INTEGRATION_KEY
            ? DEFAULT_CONTACTS_SYNC_SETTINGS
            : definition.provider_key === GIVINGFUEL_DONATIONS_INTEGRATION_KEY
              ? DEFAULT_DONATIONS_SYNC_SETTINGS
            : isKindfulIntegrationKey(definition.provider_key)
              ? DEFAULT_KINDFUL_SYNC_SETTINGS
            : {},
        field_mapping_json:
          isGivingFuelIntegrationKey(definition.provider_key)
            ? DEFAULT_WEBCONNEX_FIELD_MAPPING
            : isKindfulIntegrationKey(definition.provider_key)
              ? DEFAULT_KINDFUL_FIELD_MAPPING
            : {},
        created_by: userId,
        updated_by: userId
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as IntegrationConnection;
  }

  async upsertConfiguration(input: {
    organizationId: string;
    userId: string;
    definition: IntegrationDefinition;
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
    };
  }): Promise<IntegrationConnection> {
    const supabase = await createIntegrationClient();
    const connection = await this.ensureConnection(
      input.organizationId,
      input.userId,
      input.definition
    );
    const current = connection;

    const mergedConfiguration = {
      ...(current.configuration_json ?? {}),
      ...(input.payload.configuration ?? {})
    } as Record<string, unknown>;
    let nextApiKeyReference = input.payload.apiKeyReference ?? current.api_key_reference;

    if (typeof input.payload.apiKey === "string") {
      const trimmed = input.payload.apiKey.trim();
      if (trimmed) {
        mergedConfiguration.encryptedApiKey = encryptIntegrationSecret(trimmed);
        mergedConfiguration.apiKeyConfigured = true;
        nextApiKeyReference = null;
      } else {
        delete mergedConfiguration.encryptedApiKey;
        mergedConfiguration.apiKeyConfigured = false;
        nextApiKeyReference = null;
      }
    }

    const { data, error } = await supabase
      .from("integration_connections")
      .update({
        name: input.payload.name ?? current.name,
        base_url: input.payload.baseUrl ?? current.base_url,
        auth_type: input.payload.authType ?? current.auth_type,
        api_key_reference: nextApiKeyReference,
        is_enabled: input.payload.isEnabled ?? current.is_enabled,
        timeout_ms: input.payload.timeoutMs ?? current.timeout_ms,
        retry_settings: input.payload.retrySettings ?? current.retry_settings,
        debug_logging_enabled:
          input.payload.debugLoggingEnabled ?? current.debug_logging_enabled,
        configuration_json: mergedConfiguration,
        sync_settings_json: input.payload.syncSettings ?? current.sync_settings_json,
        field_mapping_json: input.payload.fieldMapping ?? current.field_mapping_json,
        updated_by: input.userId
      })
      .eq("organization_id", input.organizationId)
      .eq("id", connection.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as IntegrationConnection;
  }
}
