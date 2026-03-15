type WebconnexClientConfig = {
  baseUrl: string;
  authType: string;
  apiKey?: string;
  apiKeyReference?: string | null;
  authHeaderName?: string;
  staticQueryParams?: Record<string, string | number | boolean>;
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  contactsPath?: string;
  transactionsPath?: string;
  formsPath?: string;
  testPath?: string;
  defaultLimit?: number;
};

type ListParams = {
  startingAfter?: string | null;
  limit?: number;
};

type ListResponse = {
  records: Array<Record<string, unknown>>;
  nextCursor: string | null;
  hasMore: boolean;
};

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ensureHeaderSafeValue(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 255) {
      throw new Error(
        "Stored API key contains invalid characters. Please re-enter and save the API key."
      );
    }
  }
  return value;
}

function normalizeRecords(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }
  if (!payload || typeof payload !== "object") return [];
  const container = payload as Record<string, unknown>;
  const candidates = [
    container.records,
    container.items,
    container.data,
    container.customers,
    container.results,
    container.transactions,
    container.forms,
    container.forms_list,
    container.formList,
    container.form_values
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Array<Record<string, unknown>>;
    }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nested = candidate as Record<string, unknown>;
      const nestedCandidates = [
        nested.records,
        nested.items,
        nested.data,
        nested.results,
        nested.transactions,
        nested.forms
      ];
      for (const nestedCandidate of nestedCandidates) {
        if (Array.isArray(nestedCandidate)) {
          return nestedCandidate as Array<Record<string, unknown>>;
        }
      }
    }
  }
  return [];
}

function extractNextCursor(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const container = payload as Record<string, unknown>;
  const direct =
    container.next_cursor ??
    container.nextCursor ??
    container.next ??
    container.next_id ??
    container.nextId ??
    container.cursor ??
    container.next_starting_after ??
    container.starting_after ??
    container.startingAfter ??
    container.nextStartingAfter;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (typeof direct === "number" && Number.isFinite(direct)) return String(direct);
  const pagination = container.pagination as Record<string, unknown> | undefined;
  const nested =
    pagination?.next_cursor ??
    pagination?.nextCursor ??
    pagination?.next ??
    pagination?.next_id ??
    pagination?.nextId ??
    pagination?.next_starting_after ??
    pagination?.starting_after ??
    pagination?.startingAfter ??
    pagination?.nextStartingAfter;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  if (typeof nested === "number" && Number.isFinite(nested)) return String(nested);
  return null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return null;
}

function extractHasMore(payload: unknown, nextCursor: string | null, recordCount: number, limit: number) {
  if (!payload || typeof payload !== "object") {
    if (nextCursor) return true;
    return recordCount >= limit && recordCount > 0;
  }
  const container = payload as Record<string, unknown>;
  const direct = container.hasMore ?? container.has_more;
  const parsedDirect = normalizeBoolean(direct);
  if (parsedDirect !== null) return parsedDirect;
  const pagination = container.pagination as Record<string, unknown> | undefined;
  const parsedNested = normalizeBoolean(pagination?.hasMore ?? pagination?.has_more);
  if (parsedNested !== null) return parsedNested;
  if (nextCursor) return true;
  return recordCount >= limit && recordCount > 0;
}

function recordStableId(record: Record<string, unknown>) {
  const candidate =
    record.id ??
    record.displayId ??
    record.customerId ??
    record.customer_id ??
    record.transaction_id ??
    record.transactionId ??
    record.external_transaction_id;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  return "";
}

export class WebconnexApiClient {
  // Pull-only integration: Webconnex calls are always GET requests.
  private readonly requestMethod = "GET" as const;
  private baseUrl: string;
  private authType: string;
  private timeoutMs: number;
  private maxRetries: number;
  private backoffMs: number;
  private authHeaderName: string;
  private staticQueryParams: Record<string, string | number | boolean>;
  private contactsPath: string;
  private transactionsPath: string;
  private formsPath: string;
  private testPath: string;
  private defaultLimit: number;
  private apiKey?: string;
  private apiKeyReference?: string | null;

  constructor(config: WebconnexClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.authType = (config.authType || "api_key_header").toLowerCase().trim();
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.backoffMs = config.backoffMs ?? 1000;
    this.authHeaderName = config.authHeaderName ?? "apiKey";
    this.staticQueryParams = config.staticQueryParams ?? {};
    this.contactsPath = config.contactsPath ?? "/contacts";
    this.transactionsPath = config.transactionsPath ?? "/transactions";
    this.formsPath = config.formsPath ?? "/search/forms";
    this.testPath = config.testPath ?? "/health";
    this.defaultLimit = config.defaultLimit ?? 100;
    this.apiKey = config.apiKey;
    this.apiKeyReference = config.apiKeyReference ?? null;
  }

  private authMode() {
    if (["none", "no_auth", "noauth", "public", "unauthenticated"].includes(this.authType)) {
      return this.apiKey ? "api_key_header" : "none";
    }
    if (["api_key_query", "query", "query_param"].includes(this.authType)) {
      return "api_key_query";
    }
    return "api_key_header";
  }

  private buildHeaders() {
    const headers: HeadersInit = {
      "content-type": "application/json"
    };
    if (this.authMode() === "api_key_header" && this.apiKey) {
      const headerName = this.authHeaderName.trim() || "apiKey";
      const rawValue =
        headerName.toLowerCase() === "authorization" &&
        !this.apiKey.toLowerCase().startsWith("bearer ")
          ? `Bearer ${this.apiKey}`
          : this.apiKey;
      headers[headerName] = ensureHeaderSafeValue(rawValue);
    }
    return headers;
  }

  private async request(path: string, params?: Record<string, string | number>) {
    const url = new URL(`${this.baseUrl}${path}`);
    const authMode = this.authMode();
    for (const [key, value] of Object.entries(this.staticQueryParams)) {
      if (value === "" || value === null || value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === "" || value === null || value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    if (authMode === "api_key_query" && this.apiKey) {
      url.searchParams.set("api_key", this.apiKey);
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url.toString(), {
          method: this.requestMethod,
          headers: this.buildHeaders(),
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          throw new Error(`HTTP ${response.status}: ${bodyText || "Request failed"}`);
        }
        return await response.json().catch(() => ({}));
      } catch (error) {
        clearTimeout(timeout);
        lastError = error instanceof Error ? error : new Error("Webconnex request failed.");
        if (attempt >= this.maxRetries) break;
        await wait(this.backoffMs * 2 ** attempt);
      }
    }
    throw lastError ?? new Error("Webconnex request failed.");
  }

  async testConnection() {
    if (!this.baseUrl) {
      return { ok: false, message: "Base API URL is required for test connection." };
    }
    if (this.authMode() !== "none" && !this.apiKey) {
      return {
        ok: false,
        message:
          "API key secret is not configured in environment. Set WEBCONNEX_API_KEY or provider-specific secret."
      };
    }
    try {
      await this.request(this.testPath);
      try {
        await this.getContacts({ limit: 1 });
      } catch (contactsError) {
        return {
          ok: false,
          message:
            contactsError instanceof Error
              ? `Connection OK but contacts read failed: ${contactsError.message}`
              : "Connection OK but contacts read failed."
        };
      }
      return { ok: true, message: "Connection test succeeded (contacts endpoint reachable)." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Connection test failed."
      };
    }
  }

  async getContacts(params?: ListParams): Promise<ListResponse> {
    const queryParams: Record<string, string | number> = {};
    const limit =
      typeof params?.limit === "number" && params.limit > 0 ? params.limit : this.defaultLimit;
    queryParams.limit = limit;
    if (params?.startingAfter) {
      queryParams.startingAfter = params.startingAfter;
      // Some APIs expect snake_case cursor names.
      queryParams.starting_after = params.startingAfter;
    }
    const payload = await this.request(this.contactsPath, {
      ...queryParams
    });
    const records = normalizeRecords(payload);
    const extractedCursor = extractNextCursor(payload);
    const hasMore = extractHasMore(payload, extractedCursor, records.length, limit);
    const fallbackCursor =
      records.length > 0 ? recordStableId(records[records.length - 1] as Record<string, unknown>) : "";
    return {
      records,
      nextCursor: extractedCursor || (hasMore ? fallbackCursor : null),
      hasMore
    };
  }

  async getTransactions(params?: ListParams): Promise<ListResponse> {
    const queryParams: Record<string, string | number> = {};
    const limit =
      typeof params?.limit === "number" && params.limit > 0 ? params.limit : this.defaultLimit;
    queryParams.limit = limit;
    if (params?.startingAfter) {
      queryParams.startingAfter = params.startingAfter;
      queryParams.starting_after = params.startingAfter;
    }
    const payload = await this.request(this.transactionsPath, {
      ...queryParams
    });
    const records = normalizeRecords(payload);
    const extractedCursor = extractNextCursor(payload);
    const hasMore = extractHasMore(payload, extractedCursor, records.length, limit);
    const fallbackCursor =
      records.length > 0 ? recordStableId(records[records.length - 1] as Record<string, unknown>) : "";
    return {
      records,
      nextCursor: extractedCursor || (hasMore ? fallbackCursor : null),
      hasMore
    };
  }

  async getForms(params?: { limit?: number }): Promise<Array<Record<string, unknown>>> {
    const queryParams: Record<string, string | number> = {};
    const limit =
      typeof params?.limit === "number" && params.limit > 0 ? Math.min(params.limit, 500) : 500;
    queryParams.limit = limit;
    const payload = await this.request(this.formsPath, {
      ...queryParams
    });
    return normalizeRecords(payload);
  }

  async getContactById(id: string): Promise<Record<string, unknown>> {
    return (await this.request(`${this.contactsPath}/${encodeURIComponent(id)}`)) as Record<
      string,
      unknown
    >;
  }

  async getTransactionById(id: string): Promise<Record<string, unknown>> {
    return (await this.request(
      `${this.transactionsPath}/${encodeURIComponent(id)}`
    )) as Record<string, unknown>;
  }

  getApiKeyReference() {
    return this.apiKeyReference;
  }
}
