import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  extractSameOriginPaginationUrls,
  positiveIntegerEnv,
} from "./officialPortalHttp";
import {
  STATEWIDE_PORTAL_CONFIGS,
  STATEWIDE_PROCUREMENT_PORTAL_IDS,
  STATEWIDE_PROCUREMENT_SOURCES,
  allowedStatewideUrl,
  statewideAllowedOrigins,
  type StatewidePortalConfig,
} from "./statewideProcurementConfigs";
import {
  extractStatewideDiscoveryUrls,
  parseStatewideDetailHtml,
  parseStatewideListingContent,
  statewideCanonicalUrl,
  statewideContentLooksLikeChallenge,
  statewideHtmlToText,
  statewideMatchesOptions,
  statewideStableHash,
  statewideToOpportunity,
  type StatewideDetailRecord,
  type StatewideListingRecord,
} from "./statewideProcurementParser";

export {
  STATEWIDE_PORTAL_CONFIGS,
  STATEWIDE_PROCUREMENT_PORTAL_IDS,
  STATEWIDE_PROCUREMENT_SOURCES,
  allowedStatewideUrl,
  statewideAllowedOrigins,
} from "./statewideProcurementConfigs";
export {
  extractStatewideDiscoveryUrls,
  parseStatewideDetailHtml,
  parseStatewideListingContent,
} from "./statewideProcurementParser";

const DOCUMENT_URL = /\.(?:pdf|docx?|xlsx?|csv|zip|txt|rtf)(?:$|[?#])/i;

export function statewideRetryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter?.trim()) {
    const seconds = Number.parseFloat(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.round(seconds * 1_000), 10_000);
    const absolute = Date.parse(retryAfter);
    if (Number.isFinite(absolute)) return Math.min(Math.max(absolute - Date.now(), 0), 10_000);
  }
  return Math.min(400 * 2 ** Math.max(attempt, 0), 10_000);
}

export class PublicPortalSession {
  private readonly cookiesByOrigin = new Map<string, Map<string, string>>();
  private readonly origins: ReadonlySet<string>;

  constructor(private readonly config: StatewidePortalConfig) {
    this.origins = statewideAllowedOrigins(config);
  }

  private absorbCookies(origin: string, headers: Headers): void {
    const extended = headers as Headers & { getSetCookie?: () => string[] };
    const values = extended.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
    if (!values.length) return;
    const cookies = this.cookiesByOrigin.get(origin) ?? new Map<string, string>();
    for (const cookie of values) {
      const pair = cookie.split(";", 1)[0]?.trim();
      const equals = pair?.indexOf("=") ?? -1;
      if (pair && equals > 0) cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
    if (cookies.size) this.cookiesByOrigin.set(origin, cookies);
  }

  private cookieHeader(origin: string): string | undefined {
    const cookies = this.cookiesByOrigin.get(origin);
    return cookies?.size
      ? Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join("; ")
      : undefined;
  }

  private async request(url: string, timeoutMs: number): Promise<Response> {
    let current = allowedStatewideUrl(this.config, url);
    if (!current) throw new Error(`${this.config.portalId} rejected a URL outside its configured official origins`);
    const seenRedirects = new Set<string>();
    for (let redirects = 0; redirects <= 6; redirects += 1) {
      const canonical = statewideCanonicalUrl(current).toLowerCase();
      if (seenRedirects.has(canonical)) throw new Error(`${this.config.portalId} entered a redirect loop`);
      seenRedirects.add(canonical);
      const currentOrigin = new URL(current).origin;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const cookie = this.cookieHeader(currentOrigin);
        const response = await fetch(current, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            accept: "text/html,application/xhtml+xml,application/json,text/csv;q=0.9,*/*;q=0.8",
            "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
            ...(cookie ? { cookie } : {}),
          },
        });
        this.absorbCookies(currentOrigin, response.headers);
        if (response.status < 300 || response.status >= 400) return response;
        const location = response.headers.get("location");
        if (!location) return response;
        const next = allowedStatewideUrl(this.config, location, current);
        if (!next) throw new Error(`${this.config.portalId} redirected outside its configured official origins`);
        current = next;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(`${this.config.portalId} exceeded its redirect limit`);
  }

  async fetchText(url: string, timeoutMs: number, maxRetries: number, label: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await this.request(url, timeoutMs);
        const body = await response.text();
        if (response.ok) return body;
        const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
        const message = `${label} returned HTTP ${response.status}${body ? `: ${statewideHtmlToText(body).slice(0, 160)}` : ""}`;
        lastError = new Error(message);
        if (!retryable || attempt >= maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, statewideRetryDelayMs(response.headers.get("retry-after"), attempt)));
      } catch (error) {
        lastError = error;
        if (attempt >= maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, statewideRetryDelayMs(null, attempt)));
      }
    }
    if (lastError instanceof Error) {
      if (lastError.name === "AbortError") throw new Error(`${label} timed out after ${timeoutMs}ms`);
      throw lastError;
    }
    throw new Error(`${label} request failed`);
  }

  supports(url: string): boolean {
    try { return this.origins.has(new URL(url).origin); } catch { return false; }
  }
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), Math.max(items.length, 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T);
    }
  }));
  return results;
}

function platformSeedUrls(config: StatewidePortalConfig): string[] {
  const seeds = [config.listingUrl, ...(config.alternateListingUrls ?? [])];
  try {
    const listing = new URL(config.listingUrl);
    if (config.platformFamily === "bonfire_euna") {
      seeds.push(new URL("/PublicPortal/getOpenPublicOpportunitiesSectionData", listing.origin).toString());
    }
    if (config.platformFamily === "cgi_advantage" && /\/Advantage4\/?$/i.test(listing.pathname)) {
      seeds.push(new URL(listing.pathname.replace(/\/Advantage4\/?$/i, "/AltSelfService"), listing.origin).toString());
    }
    if (config.platformFamily === "peoplesoft" && !listing.searchParams.has("PAGE")) {
      listing.searchParams.set("PAGE", "SCP_PUB_BIDLIST_FL");
      seeds.push(listing.toString());
    }
  } catch {
    // isConfigured reports malformed seed URLs.
  }
  const seen = new Set<string>();
  return seeds.filter((value) => {
    const safe = allowedStatewideUrl(config, value);
    if (!safe) return false;
    const key = statewideCanonicalUrl(safe).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function enqueueUnique(queue: string[], seenPages: Set<string>, value: string): void {
  const key = statewideCanonicalUrl(value).toLowerCase();
  if (seenPages.has(key) || queue.some((queued) => statewideCanonicalUrl(queued).toLowerCase() === key)) return;
  queue.push(value);
}

export class StatewideProcurementProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(readonly config: StatewidePortalConfig) {}

  async isConfigured(): Promise<boolean> {
    const seeds = platformSeedUrls(this.config);
    return seeds.length > 0
      && seeds.every((url) => Boolean(allowedStatewideUrl(this.config, url)))
      && this.config.state.length === 2
      && Boolean(this.config.portalId && this.config.buyerName);
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("STATEWIDE_PORTAL_REQUEST_TIMEOUT_MS", 20_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_RETRIES", 2, 0, 2);
    const maxPages = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_PAGES", 8, 1, 20);
    const maxResults = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_RESULTS", 100, 1, 500);
    const detailConcurrency = positiveIntegerEnv("STATEWIDE_PORTAL_DETAIL_CONCURRENCY", 4, 1, 8);
    const offset = Math.max(options.offset ?? 0, 0);
    const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    const targetCount = Math.min(maxResults, offset + requestedLimit);
    const session = new PublicPortalSession(this.config);
    const queue = platformSeedUrls(this.config);
    const seenPages = new Set<string>();
    const seenSignatures = new Set<string>();
    const listings = new Map<string, StatewideListingRecord>();
    const errors: string[] = [];
    let listingPage = 0;
    let challengeCount = 0;
    let successfulFetches = 0;

    if (!(await this.isConfigured())) {
      const reason = `${this.config.portalId}: invalid or empty statewide adapter configuration`;
      this.lastError = reason;
      return { records: [], total: 0, errors: [reason] };
    }

    while (queue.length && listingPage < maxPages && listings.size < targetCount) {
      const pageUrl = queue.shift();
      if (!pageUrl) break;
      const safePageUrl = allowedStatewideUrl(this.config, pageUrl);
      if (!safePageUrl) {
        errors.push(`${this.config.portalId}: rejected listing URL outside configured official origins: ${pageUrl}`);
        continue;
      }
      const pageKey = statewideCanonicalUrl(safePageUrl).toLowerCase();
      if (seenPages.has(pageKey)) continue;
      seenPages.add(pageKey);
      let content: string;
      try {
        content = await session.fetchText(safePageUrl, timeoutMs, maxRetries, `${this.config.portalId} listing`);
        successfulFetches += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(listings.size ? `${this.config.portalId}: partial listing results after ${reason}` : `${this.config.portalId}: ${reason}`);
        continue;
      }
      if (statewideContentLooksLikeChallenge(content)) challengeCount += 1;
      const signature = statewideStableHash(statewideHtmlToText(content) || content.slice(0, 10_000));
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);
      listingPage += 1;

      for (const listing of parseStatewideListingContent(content, this.config, safePageUrl, listingPage)) {
        const key = listing.nativeId.toLowerCase();
        if (!listings.has(key)) listings.set(key, listing);
        if (listings.size >= targetCount) break;
      }
      if (listingPage >= maxPages || listings.size >= targetCount) continue;

      const origin = new URL(safePageUrl).origin;
      for (const nextUrl of extractSameOriginPaginationUrls(content, safePageUrl, origin, maxPages * 3)) {
        const safe = allowedStatewideUrl(this.config, nextUrl, safePageUrl);
        if (safe) enqueueUnique(queue, seenPages, safe);
      }
      for (const discovered of extractStatewideDiscoveryUrls(content, safePageUrl, this.config, maxPages * 4)) {
        enqueueUnique(queue, seenPages, discovered);
      }
    }

    if (!listings.size) {
      this.recordCount = 0;
      if (successfulFetches > 0 && challengeCount < successfulFetches) {
        this.lastError = undefined;
        this.lastSuccess = new Date();
        return { records: [], total: 0, errors: [] };
      }
      if (challengeCount > 0) {
        errors.push(`${this.config.portalId}: official public route returned a browser/login challenge and no parseable public records`);
      } else if (!errors.length) {
        errors.push(`${this.config.portalId}: all configured official listing requests failed before content was returned`);
      }
      this.lastError = errors.join("; ");
      return { records: [], total: 0, errors };
    }

    const enriched = await mapConcurrent(
      Array.from(listings.values()).slice(0, targetCount),
      detailConcurrency,
      async (listing) => {
        let detail: StatewideDetailRecord | undefined;
        const detailUrl = statewideCanonicalUrl(listing.detailUrl);
        const isSeed = platformSeedUrls(this.config).some((seed) => statewideCanonicalUrl(seed) === detailUrl);
        const isDocument = DOCUMENT_URL.test(new URL(detailUrl).pathname + new URL(detailUrl).search);
        if (!isSeed && !isDocument && session.supports(detailUrl)) {
          try {
            const html = await session.fetchText(detailUrl, timeoutMs, maxRetries, `${this.config.portalId} detail ${listing.nativeId}`);
            detail = parseStatewideDetailHtml(html, this.config, detailUrl);
          } catch (error) {
            errors.push(`${this.config.portalId}:${listing.nativeId}: detail enrichment failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        return statewideToOpportunity(this.config, listing, detail);
      },
    );

    const seen = new Set<string>();
    const records = enriched
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => statewideMatchesOptions(record, options))
      .filter((record) => {
        if (seen.has(record.externalId)) return false;
        seen.add(record.externalId);
        return true;
      })
      .slice(offset, offset + requestedLimit);

    this.recordCount = records.length;
    this.lastError = records.length ? undefined : errors.join("; ") || undefined;
    if (records.length || !errors.length) this.lastSuccess = new Date();
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: this.name,
      configured,
      healthy: configured && !this.lastError,
      errorMessage: this.lastError,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      recordCount: this.recordCount,
    };
  }
}

export const statewideProcurementProviders: Record<string, StatewideProcurementProvider> = Object.fromEntries(
  STATEWIDE_PORTAL_CONFIGS.map((config) => [config.portalId, new StatewideProcurementProvider(config)]),
);

export function statewideProcurementProvider(portalId: string): StatewideProcurementProvider | undefined {
  return statewideProcurementProviders[portalId];
}
