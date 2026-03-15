import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationDefinition } from "@/lib/integrations/types";

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
    externalContactId: "contact_id",
    amount: "amount",
    donationDate: "donation_date",
    paymentMethod: "payment_method",
    status: "status",
    campaign: "campaign",
    notes: "notes"
  }
};

const DEFAULT_WEBCONNEX_SYNC_SETTINGS = {
  syncMode: "manual_and_scheduled",
  scheduleFrequency: "daily",
  contactSyncEnabled: true,
  donationSyncEnabled: true,
  fullSyncEnabled: true,
  incrementalSyncEnabled: true,
  fallbackContactMatch: "email_if_configured",
  initialImportStartDate: null,
  lastSuccessfulSyncDate: null,
  contactsCursor: null,
  donationsCursor: null
};

function defaultConnectionName(definition: IntegrationDefinition) {
  if (definition.provider_key === "webconnex") return "Giving Fuel";
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
        base_url: null,
        auth_type: "api_key_header",
        api_key_reference: null,
        is_enabled: false,
        connection_status: "not_tested",
        timeout_ms: 30000,
        retry_settings: { maxRetries: 3, backoffMs: 1000 },
        debug_logging_enabled: false,
        configuration_json:
          definition.provider_key === "webconnex"
            ? {
                contactsPath: "/contacts",
                transactionsPath: "/transactions",
                testPath: "/health",
                authHeaderName: "Authorization"
              }
            : {},
        sync_settings_json:
          definition.provider_key === "webconnex" ? DEFAULT_WEBCONNEX_SYNC_SETTINGS : {},
        field_mapping_json:
          definition.provider_key === "webconnex" ? DEFAULT_WEBCONNEX_FIELD_MAPPING : {},
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
      apiKeyReference?: string;
      isEnabled?: boolean;
      timeoutMs?: number;
      retrySettings?: Record<string, unknown>;
      debugLoggingEnabled?: boolean;
      configuration?: Record<string, unknown>;
      syncSettings?: Record<string, unknown>;
      fieldMapping?: Record<string, unknown>;
    };
  }): Promise<IntegrationConnection> {
    const supabase = await createIntegrationClient();
    const connection = await this.ensureConnection(
      input.organizationId,
      input.userId,
      input.definition
    );
    const current = connection;

    const { data, error } = await supabase
      .from("integration_connections")
      .update({
        name: input.payload.name ?? current.name,
        base_url: input.payload.baseUrl ?? current.base_url,
        auth_type: input.payload.authType ?? current.auth_type,
        api_key_reference: input.payload.apiKeyReference ?? current.api_key_reference,
        is_enabled: input.payload.isEnabled ?? current.is_enabled,
        timeout_ms: input.payload.timeoutMs ?? current.timeout_ms,
        retry_settings: input.payload.retrySettings ?? current.retry_settings,
        debug_logging_enabled:
          input.payload.debugLoggingEnabled ?? current.debug_logging_enabled,
        configuration_json: input.payload.configuration ?? current.configuration_json,
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
