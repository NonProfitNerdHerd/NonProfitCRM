type WebconnexClientConfig = {
  baseUrl: string;
  authType: string;
  apiKey?: string;
  apiKeyReference?: string | null;
  authHeaderName?: string;
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
  private baseUrl: string;
  private timeoutMs: number;
  private maxRetries: number;
  private backoffMs: number;
  private authHeaderName: string;
  private contactsPath: string;
  private transactionsPath: string;
  private testPath: string;
  private apiKey?: string;
  private apiKeyReference?: string | null;

  constructor(config: WebconnexClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.backoffMs = config.backoffMs ?? 1000;
    this.authHeaderName = config.authHeaderName ?? "Authorization";
    this.contactsPath = config.contactsPath ?? "/contacts";
    this.transactionsPath = config.transactionsPath ?? "/transactions";
    this.testPath = config.testPath ?? "/health";
    this.apiKey = config.apiKey;
    this.apiKeyReference = config.apiKeyReference ?? null;
  }

  private buildHeaders() {
    const headers: HeadersInit = {
      "content-type": "application/json"
    };
    if (this.apiKey) {
      headers[this.authHeaderName] =
        this.authHeaderName.toLowerCase() === "authorization"
          ? `Bearer ${this.apiKey}`
          : this.apiKey;
    }
    return headers;
  }

  private async request(path: string, params?: Record<string, string | number>) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === "" || value === null || value === undefined) continue;
      url.searchParams.set(key, String(value));
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url.toString(), {
          method: "GET",
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
    if (!this.apiKey) {
      return {
        ok: false,
        message:
          "API key secret is not configured in environment. Set WEBCONNEX_API_KEY or provider-specific secret."
      };
    }
    try {
      await this.request(this.testPath);
      return { ok: true, message: "Connection test succeeded." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Connection test failed."
      };
    }
  }

  async getContacts(params?: ListParams): Promise<ListResponse> {
    const payload = await this.request(this.contactsPath, {
      cursor: params?.cursor ?? "",
      updated_since: params?.updatedSince ?? "",
      page_size: params?.pageSize ?? 100
    });
    return {
      records: normalizeRecords(payload),
      nextCursor: extractNextCursor(payload)
    };
  }

  async getTransactions(params?: ListParams): Promise<ListResponse> {
    const payload = await this.request(this.transactionsPath, {
      cursor: params?.cursor ?? "",
      updated_since: params?.updatedSince ?? "",
      page_size: params?.pageSize ?? 100
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
