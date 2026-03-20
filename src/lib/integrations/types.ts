export type IntegrationDefinition = {
  id: string;
  name: string;
  provider_key: string;
  description: string | null;
  category: string;
  is_active: boolean;
  supports_manual_sync: boolean;
  supports_scheduled_sync: boolean;
  supports_test_connection: boolean;
  created_at: string;
  updated_at: string;
};

export type IntegrationConnection = {
  id: string;
  organization_id: string;
  integration_definition_id: string;
  name: string;
  base_url: string | null;
  auth_type: string;
  api_key_reference: string | null;
  is_enabled: boolean;
  allow_module_access?: boolean;
  connection_status: string;
  last_connection_test_date: string | null;
  last_connection_test_result: string | null;
  timeout_ms: number;
  retry_settings: Record<string, unknown>;
  debug_logging_enabled: boolean;
  configuration_json: Record<string, unknown>;
  sync_settings_json: Record<string, unknown>;
  field_mapping_json: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationSyncJob = {
  id: string;
  organization_id: string;
  integration_connection_id: string;
  job_type: string;
  sync_scope: string;
  started_date: string;
  completed_date: string | null;
  status: string;
  records_processed: number;
  records_retrieved: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  records_failed: number;
  total_records_expected: number | null;
  current_cursor: string | null;
  current_page: number | null;
  last_successful_cursor: string | null;
  last_successful_sync_date: string | null;
  completed_successfully: boolean;
  paging_complete: boolean;
  error_summary: string | null;
  triggered_by: string | null;
  triggered_by_type: string;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationSyncLog = {
  id: string;
  organization_id: string;
  sync_job_id: string;
  integration_connection_id: string;
  entity_type: string;
  source_record_id: string | null;
  crm_record_id: string | null;
  action_taken: string | null;
  status: string;
  message: string | null;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  logged_date: string;
  created_at: string;
  updated_at: string;
};

export type IntegrationErrorQueueItem = {
  id: string;
  organization_id: string;
  integration_connection_id: string;
  sync_job_id: string | null;
  entity_type: string;
  source_record_id: string | null;
  payload_json: Record<string, unknown>;
  error_message: string;
  retry_count: number;
  status: string;
  next_retry_date: string | null;
  last_retry_date: string | null;
  created_at: string;
  updated_at: string;
};

export type SyncScope = "contacts" | "donations" | "all";

export type IntegrationDashboardItem = {
  definition: IntegrationDefinition;
  connection: IntegrationConnection | null;
  lastJob: IntegrationSyncJob | null;
};
