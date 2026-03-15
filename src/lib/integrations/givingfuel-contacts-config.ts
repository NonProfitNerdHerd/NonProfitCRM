export const GIVINGFUEL_INTEGRATION_KEY = "webconnex";
export const GIVINGFUEL_INTEGRATION_NAME = "GivingFuel Contacts";
export const GIVINGFUEL_DONATIONS_INTEGRATION_KEY = "givingfuel_donations";
export const GIVINGFUEL_DONATIONS_INTEGRATION_NAME = "GivingFuel Donations";
export const GIVINGFUEL_BASE_URL = "https://api.webconnex.com/v2/public";
export const GIVINGFUEL_CUSTOMERS_PATH = "/search/customers";
export const GIVINGFUEL_TRANSACTIONS_PATH = "/search/transactions";
export const GIVINGFUEL_FORMS_PATH = "/search/forms";
export const GIVINGFUEL_PRODUCT_VALUE = "givingfuel.com";
export const GIVINGFUEL_API_HEADER_NAME = "apiKey";
export const GIVINGFUEL_DEFAULT_PAGE_LIMIT = 100;

export function isGivingFuelIntegrationKey(key: string) {
  return key === GIVINGFUEL_INTEGRATION_KEY || key === GIVINGFUEL_DONATIONS_INTEGRATION_KEY;
}
