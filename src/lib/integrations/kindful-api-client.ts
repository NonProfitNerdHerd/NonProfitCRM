type KindfulClientConfig = {
  baseUrl: string;
  authType: string;
  applicationToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  requestIntervalMs?: number;
  contactsQueryPath?: string;
  transactionsQueryPath?: string;
  notesPath?: string;
  activitiesPath?: string;
  syncStatusPath?: string;
  importStatusPathTemplate?: string;
  orgDetailsPath?: string;
  authHeaderName?: string;
  authHeaderPrefix?: string;
  pageSize?: number;
};

type QueryMode = "linked" | "changed" | "unlinked";

export type KindfulQueryInput = {
  query?: Array<QueryMode | Record<string, unknown>>;
  queryToken?: string | null;
  columns?: Record<string, unknown>;
  customFields?: Array<number | string>;
  perPage?: number;
};

export type KindfulQueryResult = {
  records: Array<Record<string, unknown>>;
  nextQueryToken: string | null;
  hasMore: boolean;
  totalExpected: number | null;
  raw: Record<string, unknown>;
};

export type KindfulListInput = {
  page?: number;
  perPage?: number;
  updatedSince?: string | null;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function readFirstString(container: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = container[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readFirstNumber(container: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = container[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function normalizeRecords(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.filter((row) => typeof row === "object" && row !== null) as Array<Record<string, unknown>>;
  }
  if (!payload || typeof payload !== "object") return [] as Array<Record<string, unknown>>;
  const container = payload as Record<string, unknown>;
  const candidates = [
    container.records,
    container.items,
    container.data,
    container.contacts,
    container.transactions,
    container.results
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((row) => typeof row === "object" && row !== null) as Array<
        Record<string, unknown>
      >;
    }
  }
  return [] as Array<Record<string, unknown>>;
}

function asObject(payload: unknown) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    // Operators sometimes paste a full endpoint URL; normalize to host root.
    return parsed.origin.replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export class KindfulApiClient {
  private baseUrl: string;
  private authType: string;
  private token?: string;
  private timeoutMs: number;
  private maxRetries: number;
  private backoffMs: number;
  private requestIntervalMs: number;
  private contactsQueryPath: string;
  private transactionsQueryPath: string;
  private notesPath: string;
  private activitiesPath: string;
  private syncStatusPath: string;
  private importStatusPathTemplate: string;
  private orgDetailsPath: string;
  private authHeaderName: string;
  private authHeaderPrefix: string;
  private pageSize: number;
  private lastRequestAt = 0;

  constructor(config: KindfulClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl || "");
    this.authType = (config.authType || "api_key_header").toLowerCase().trim();
    this.token = config.applicationToken?.trim();
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.backoffMs = config.backoffMs ?? 1000;
    this.requestIntervalMs = config.requestIntervalMs ?? 200;
    this.contactsQueryPath = config.contactsQueryPath ?? "/admin/oauth2/api/v1/contacts/query";
    this.transactionsQueryPath =
      config.transactionsQueryPath ?? "/admin/oauth2/api/v1/transactions/query";
    this.notesPath = config.notesPath ?? "/admin/oauth2/api/v1/notes";
    this.activitiesPath = config.activitiesPath ?? "/admin/oauth2/api/v1/activities";
    this.syncStatusPath = config.syncStatusPath ?? "/admin/oauth2/api/v1/imports/stats";
    this.importStatusPathTemplate =
      config.importStatusPathTemplate ?? "/admin/oauth2/api/v1/imports/{jobId}";
    this.orgDetailsPath = config.orgDetailsPath ?? this.syncStatusPath;
    this.authHeaderName = config.authHeaderName ?? "Authorization";
    this.authHeaderPrefix = config.authHeaderPrefix ?? "Token token=";
    this.pageSize = Math.max(1, Math.min(config.pageSize ?? 50, 50));
  }

  private authMode() {
    if (["none", "public", "no_auth", "unauthenticated"].includes(this.authType)) return "none";
    return "api_key_header";
  }

  private buildAuthHeaderCandidates() {
    if (!this.token) return [] as string[];
    const prefix = (this.authHeaderPrefix ?? "").trim();
    const base = prefix
      ? prefix.includes("{token}")
        ? prefix.replaceAll("{token}", this.token)
        : `${prefix}${this.token}`
      : this.token;
    const candidates = [
      base,
      `Token token=${this.token}`,
      `Token token="${this.token}"`,
      `Token ${this.token}`,
      `Bearer ${this.token}`,
      this.token
    ].filter((value) => value.trim().length > 0);
    const deduped = new Set<string>();
    for (const candidate of candidates) deduped.add(candidate);
    return Array.from(deduped);
  }

  private buildAuthHeaderNameCandidates() {
    const candidates = [this.authHeaderName, "Authorization"].filter((value) => value.trim().length > 0);
    const deduped = new Set<string>();
    for (const candidate of candidates) deduped.add(candidate);
    return Array.from(deduped);
  }

  private buildHeaders(input: {
    method: "GET" | "POST";
    authHeaderValue?: string;
    authHeaderNameOverride?: string;
  }) {
    const headers: HeadersInit = { accept: "application/json" };
    if (input.method === "POST") {
      headers["content-type"] = "application/json";
    }
    if (this.authMode() === "api_key_header" && this.token) {
      const headerName = input.authHeaderNameOverride ?? this.authHeaderName;
      headers[headerName] = input.authHeaderValue ?? this.buildAuthHeaderCandidates()[0] ?? this.token;
    }
    return headers;
  }

  private async paceRequest() {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.requestIntervalMs) {
      await wait(this.requestIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private buildUrl(path: string) {
    if (!this.baseUrl) {
      throw new Error("Kindful base URL is not configured.");
    }
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async request<T>(input: {
    method: "GET" | "POST";
    path: string;
    body?: Record<string, unknown>;
  }): Promise<T> {
    if (this.authMode() !== "none" && !this.token) {
      throw new Error("Kindful Application Token is not configured.");
    }

    let lastError: Error | null = null;
    const url = this.buildUrl(input.path);
    const authCandidates =
      this.authMode() === "api_key_header" ? this.buildAuthHeaderCandidates() : [""];
    const requestAuthCandidates = authCandidates.length > 0 ? authCandidates : [""];
    const requestAuthHeaderNames =
      this.authMode() === "api_key_header" ? this.buildAuthHeaderNameCandidates() : [""];
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      for (let headerNameIndex = 0; headerNameIndex < requestAuthHeaderNames.length; headerNameIndex += 1) {
        for (let candidateIndex = 0; candidateIndex < requestAuthCandidates.length; candidateIndex += 1) {
          await this.paceRequest();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
          const authHeaderValue =
            this.authMode() === "api_key_header" ? requestAuthCandidates[candidateIndex] : undefined;
          const authHeaderNameOverride =
            this.authMode() === "api_key_header" ? requestAuthHeaderNames[headerNameIndex] : undefined;
          try {
            const response = await fetch(url, {
              method: input.method,
              headers: this.buildHeaders({
                method: input.method,
                authHeaderValue,
                authHeaderNameOverride
              }),
              body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
              signal: controller.signal
            });
            clearTimeout(timeout);
            const rawText = await response.text().catch(() => "");
            const parsed = rawText ? (JSON.parse(rawText) as unknown) : {};
            if (!response.ok) {
              const is401 = response.status === 401;
              const hasMoreAuthCandidates =
                headerNameIndex < requestAuthHeaderNames.length - 1 ||
                candidateIndex < requestAuthCandidates.length - 1;
              if (is401 && hasMoreAuthCandidates) {
                continue;
              }
              const extraHint =
                is401 && !hasMoreAuthCandidates
                  ? ` Verify Application Token, environment (Sandbox vs Production), and auth header configuration. Tried headers: ${requestAuthHeaderNames.join(", ")}.`
                  : "";
              throw new Error(
                `Kindful ${input.method} ${input.path} failed with HTTP ${response.status}: ${
                  rawText || "Request failed"
                }.${extraHint}`
              );
            }
            return parsed as T;
          } catch (error) {
            clearTimeout(timeout);
            lastError =
              error instanceof Error ? error : new Error(`Kindful request failed: ${String(error)}`);
            const hasMoreAuthCandidates =
              headerNameIndex < requestAuthHeaderNames.length - 1 ||
              candidateIndex < requestAuthCandidates.length - 1;
            if (hasMoreAuthCandidates) {
              continue;
            }
          }
        }
      }
      if (attempt >= this.maxRetries) break;
      await wait(this.backoffMs * 2 ** attempt);
    }
    throw lastError ?? new Error("Kindful request failed.");
  }

  private normalizeQueryResult(payload: unknown, perPage: number): KindfulQueryResult {
    const raw = asObject(payload);
    const records = normalizeRecords(payload);
    const nextQueryToken = readFirstString(raw, ["query_token", "queryToken", "next_query_token"]);
    const hasMore =
      normalizeBoolean(raw.has_more ?? raw.hasMore) ??
      (Boolean(nextQueryToken) || (records.length >= perPage && records.length > 0));
    const totalExpected = readFirstNumber(raw, [
      "total_count",
      "totalCount",
      "total_records",
      "totalRecords",
      "count"
    ]);
    return {
      records,
      nextQueryToken,
      hasMore,
      totalExpected,
      raw
    };
  }

  async getOrganizationDetails() {
    return this.request<Record<string, unknown>>({
      method: "GET",
      path: this.orgDetailsPath
    });
  }

  async getSyncStatus() {
    const candidates = Array.from(
      new Set(
        [
          this.syncStatusPath,
          "/admin/oauth2/api/v1/imports/stats",
          "/api/v1/imports/stats",
          "/admin/oauth2/api/v1/imports",
          "/api/v1/imports"
        ]
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    );
    let last404Error: Error | null = null;
    let lastError: Error | null = null;
    for (const path of candidates) {
      try {
        const payload = await this.request<unknown>({
          method: "GET",
          path
        });
        const normalized = asObject(payload);
        return Object.keys(normalized).length > 0
          ? normalized
          : { sync_status_path_used: path, payload };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("HTTP 404")) {
          last404Error = error instanceof Error ? error : new Error(message);
          continue;
        }
        lastError = error instanceof Error ? error : new Error(message);
      }
    }
    if (lastError) throw lastError;
    if (last404Error) {
      throw new Error(
        `Kindful sync status endpoint was not found for base URL ${this.baseUrl}. Tried: ${candidates.join(
          ", "
        )}. Save base URL as just the root host (for example: https://app.kindful.com).`
      );
    }
    throw new Error("Kindful sync status request failed.");
  }

  async getImportStatus(jobId: string) {
    const path = this.importStatusPathTemplate.replace("{jobId}", encodeURIComponent(jobId));
    return this.request<Record<string, unknown>>({
      method: "GET",
      path
    });
  }

  async queryContacts(input: KindfulQueryInput = {}): Promise<KindfulQueryResult> {
    const perPage = Math.max(1, Math.min(input.perPage ?? this.pageSize, 50));
    const body: Record<string, unknown> = {
      query: input.query ?? ["linked", "changed"],
      per_page: perPage
    };
    if (input.queryToken) body.query_token = input.queryToken;
    if (input.columns) body.columns = input.columns;
    if (Array.isArray(input.customFields) && input.customFields.length > 0) {
      body.custom_fields = input.customFields;
    }
    const payload = await this.request<Record<string, unknown>>({
      method: "POST",
      path: this.contactsQueryPath,
      body
    });
    return this.normalizeQueryResult(payload, perPage);
  }

  async queryTransactions(input: KindfulQueryInput = {}): Promise<KindfulQueryResult> {
    const perPage = Math.max(1, Math.min(input.perPage ?? this.pageSize, 50));
    const body: Record<string, unknown> = {
      query: input.query ?? ["changed"],
      per_page: perPage
    };
    if (input.queryToken) body.query_token = input.queryToken;
    if (input.columns) body.columns = input.columns;
    if (Array.isArray(input.customFields) && input.customFields.length > 0) {
      body.custom_fields = input.customFields;
    }
    const payload = await this.request<Record<string, unknown>>({
      method: "POST",
      path: this.transactionsQueryPath,
      body
    });
    return this.normalizeQueryResult(payload, perPage);
  }

  async queryMetadata(path: string) {
    return this.request<Record<string, unknown>>({
      // Read-only mode: metadata calls are GET-only by design.
      method: "GET",
      path
    });
  }

  async getNotes(input: KindfulListInput = {}) {
    const perPage = Math.max(1, Math.min(input.perPage ?? this.pageSize, 200));
    const params = new URLSearchParams();
    params.set("per_page", String(perPage));
    if (typeof input.page === "number" && Number.isFinite(input.page) && input.page > 0) {
      params.set("page", String(Math.floor(input.page)));
    }
    if (input.updatedSince) params.set("updated_since", input.updatedSince);
    const path = `${this.notesPath}${this.notesPath.includes("?") ? "&" : "?"}${params.toString()}`;
    const payload = await this.request<Record<string, unknown>>({
      method: "GET",
      path
    });
    return this.normalizeQueryResult(payload, perPage);
  }

  async getActivities(input: KindfulListInput = {}) {
    const perPage = Math.max(1, Math.min(input.perPage ?? this.pageSize, 200));
    const params = new URLSearchParams();
    params.set("per_page", String(perPage));
    if (typeof input.page === "number" && Number.isFinite(input.page) && input.page > 0) {
      params.set("page", String(Math.floor(input.page)));
    }
    if (input.updatedSince) params.set("updated_since", input.updatedSince);
    const path = `${this.activitiesPath}${this.activitiesPath.includes("?") ? "&" : "?"}${params.toString()}`;
    const payload = await this.request<Record<string, unknown>>({
      method: "GET",
      path
    });
    return this.normalizeQueryResult(payload, perPage);
  }

  async testConnection() {
    if (!this.baseUrl) {
      return { ok: false, message: "Kindful base URL is required." };
    }
    if (this.authMode() !== "none" && !this.token) {
      return { ok: false, message: "Kindful Application Token is required." };
    }
    try {
      const sync = await this.getSyncStatus();
      const syncEnabled = normalizeBoolean(sync.sync_enabled);
      return {
        ok: true,
        message:
          syncEnabled === false
            ? "Connection succeeded. Kindful sync status is currently paused (sync_enabled=false)."
            : "Connection succeeded."
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Kindful connection failed."
      };
    }
  }
}
