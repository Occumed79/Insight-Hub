import { describeOfficialPortalRequestError } from "./officialPortalHttp";

export interface PlatformRequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxRetries: number;
  signal?: AbortSignal;
  redirectLimit?: number;
}

export interface PlatformResponse {
  body: string;
  headers: Headers;
  status: number;
  url: string;
}

const RETRYABLE_STATUS = new Set([408, 425, 429]);

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(headers: Headers, attempt: number): number {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.round(seconds * 1_000), 10_000);
    }
    const absolute = Date.parse(retryAfter);
    if (Number.isFinite(absolute)) {
      return Math.min(Math.max(absolute - Date.now(), 0), 10_000);
    }
  }
  return Math.min(400 * 2 ** Math.max(attempt, 0), 10_000);
}

export class OfficialPlatformSession {
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly cookiesByOrigin = new Map<string, Map<string, string>>();

  constructor(
    origins: readonly string[],
    private readonly label: string,
  ) {
    this.allowedOrigins = new Set(origins.map((value) => new URL(value).origin));
  }

  private safeUrl(value: string, base?: string): string {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol) || !this.allowedOrigins.has(url.origin)) {
      throw new Error(`${this.label} rejected a request outside its configured official origins: ${url.toString()}`);
    }
    return url.toString();
  }

  private absorbCookies(origin: string, headers: Headers): void {
    const extended = headers as Headers & { getSetCookie?: () => string[] };
    const values = extended.getSetCookie?.()
      ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
    if (!values.length) return;

    const cookies = this.cookiesByOrigin.get(origin) ?? new Map<string, string>();
    for (const value of values) {
      const pair = value.split(";", 1)[0]?.trim();
      const separator = pair?.indexOf("=") ?? -1;
      if (pair && separator > 0) {
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
    if (cookies.size) this.cookiesByOrigin.set(origin, cookies);
  }

  private cookieHeader(origin: string): string | undefined {
    const cookies = this.cookiesByOrigin.get(origin);
    return cookies?.size
      ? Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join("; ")
      : undefined;
  }

  private async singleRequest(
    inputUrl: string,
    options: PlatformRequestOptions,
  ): Promise<PlatformResponse> {
    let currentUrl = this.safeUrl(inputUrl);
    let method = options.method ?? "GET";
    let body = options.body;
    let headers = { ...(options.headers ?? {}) };
    const redirectLimit = options.redirectLimit ?? 8;
    const visited = new Set<string>();

    for (let redirect = 0; redirect <= redirectLimit; redirect += 1) {
      const key = `${method}:${currentUrl}`.toLowerCase();
      if (visited.has(key)) throw new Error(`${this.label} entered a redirect loop at ${currentUrl}`);
      visited.add(key);

      const controller = new AbortController();
      const abortFromParent = () => controller.abort(options.signal?.reason);
      if (options.signal?.aborted) abortFromParent();
      else options.signal?.addEventListener("abort", abortFromParent, { once: true });
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);

      try {
        const origin = new URL(currentUrl).origin;
        const cookie = this.cookieHeader(origin);
        const response = await fetch(currentUrl, {
          method,
          body: method === "POST" ? body : undefined,
          signal: controller.signal,
          redirect: "manual",
          headers: {
            accept: "text/html,application/xhtml+xml,application/json,text/csv;q=0.9,*/*;q=0.8",
            "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
            ...(cookie ? { cookie } : {}),
            ...headers,
          },
        });
        this.absorbCookies(origin, response.headers);

        if (response.status < 300 || response.status >= 400) {
          return {
            body: await response.text(),
            headers: response.headers,
            status: response.status,
            url: currentUrl,
          };
        }

        const location = response.headers.get("location");
        if (!location) {
          return {
            body: await response.text(),
            headers: response.headers,
            status: response.status,
            url: currentUrl,
          };
        }

        currentUrl = this.safeUrl(location, currentUrl);
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
          const nextHeaders = { ...headers };
          delete nextHeaders["content-type"];
          delete nextHeaders["content-length"];
          headers = nextHeaders;
        }
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abortFromParent);
      }
    }

    throw new Error(`${this.label} exceeded its redirect limit`);
  }

  async requestText(
    url: string,
    options: PlatformRequestOptions,
  ): Promise<PlatformResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
      try {
        const result = await this.singleRequest(url, options);
        if (result.status >= 200 && result.status < 300) return result;

        const preview = result.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
        const error = new Error(`${this.label} returned HTTP ${result.status}${preview ? `: ${preview}` : ""}`);
        lastError = error;
        if ((!RETRYABLE_STATUS.has(result.status) && result.status < 500) || attempt >= options.maxRetries) {
          throw error;
        }
        await delay(retryDelay(result.headers, attempt));
      } catch (error) {
        lastError = error;
        if (attempt >= options.maxRetries || options.signal?.aborted) break;
        await delay(Math.min(400 * 2 ** attempt, 10_000));
      }
    }

    throw new Error(describeOfficialPortalRequestError(lastError, this.label, options.timeoutMs));
  }
}
