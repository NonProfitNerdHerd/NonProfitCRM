export const KINDFUL_INTEGRATION_KEY = "kindful";
export const KINDFUL_INTEGRATION_NAME = "Kindful Migration + Sync";

// Customer API default host (configurable per connection).
export const KINDFUL_BASE_URL = "https://app.kindful.com";

// Documented query + status endpoints.
export const KINDFUL_CONTACTS_QUERY_PATH = "/admin/oauth2/api/v1/contacts/query";
export const KINDFUL_TRANSACTIONS_QUERY_PATH = "/admin/oauth2/api/v1/transactions/query";
export const KINDFUL_SYNC_STATUS_PATH = "/admin/oauth2/api/v1/imports/stats";
export const KINDFUL_IMPORT_STATUS_PATH_TEMPLATE = "/admin/oauth2/api/v1/imports/{jobId}";

// Kindful query docs note max/default page size of 50.
export const KINDFUL_DEFAULT_PAGE_SIZE = 50;

// Application Token auth is configured as an HTTP Authorization token.
export const KINDFUL_AUTH_HEADER_NAME = "Authorization";
export const KINDFUL_AUTH_HEADER_PREFIX = "Token token=";

export function isKindfulIntegrationKey(key: string) {
  return key === KINDFUL_INTEGRATION_KEY;
}
