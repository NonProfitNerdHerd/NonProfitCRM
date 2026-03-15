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
  testPath?: string;
};

type ListParams = {
  cursor?: string | null;
  updatedSince?: string | null;
  pageSize?: number;
};

type ListResponse = {
  records: Array<Record<string, unknown>>;
  nextCursor: string | null;
};

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeRecords(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }
  if (!payload || typeof payload !== "object") return [];
  const container = payload as Record<string, unknown>;
  const candidates = [container.records, container.items, container.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function extractNextCursor(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const container = payload as Record<string, unknown>;
  const direct = container.next_cursor ?? container.nextCursor ?? container.cursor;
  if (typeof direct === "string" && direct.trim()) return direct;
  const pagination = container.pagination as Record<string, unknown> | undefined;
  const nested = pagination?.next_cursor ?? pagination?.nextCursor;
  return typeof nested === "string" && nested.trim() ? nested : null;
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
  private testPath: string;
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
    this.testPath = config.testPath ?? "/health";
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
      const rawValue =
        this.authHeaderName.toLowerCase() === "authorization" &&
        !this.apiKey.toLowerCase().startsWith("bearer ")
          ? `Bearer ${this.apiKey}`
          : this.apiKey;
      headers[this.authHeaderName] =
        rawValue;
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
        await this.getContacts({ pageSize: 1 });
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
    if (params?.cursor) queryParams.cursor = params.cursor;
    if (params?.updatedSince) queryParams.updated_since = params.updatedSince;
    if (params?.pageSize && params.pageSize > 0) queryParams.page_size = params.pageSize;
    const payload = await this.request(this.contactsPath, {
      ...queryParams
    });
    return {
      records: normalizeRecords(payload),
      nextCursor: extractNextCursor(payload)
    };
  }

  async getTransactions(params?: ListParams): Promise<ListResponse> {
    const queryParams: Record<string, string | number> = {};
    if (params?.cursor) queryParams.cursor = params.cursor;
    if (params?.updatedSince) queryParams.updated_since = params.updatedSince;
    if (params?.pageSize && params.pageSize > 0) queryParams.page_size = params.pageSize;
    const payload = await this.request(this.transactionsPath, {
      ...queryParams
    });
    return {
      records: normalizeRecords(payload),
      nextCursor: extractNextCursor(payload)
    };
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
