import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { extractSameOriginPaginationUrls, positiveIntegerEnv, sameOriginUrl } from "./officialPortalHttp";
import { STATEWIDE_PORTAL_CONFIGS, STATEWIDE_PROCUREMENT_PORTAL_IDS, STATEWIDE_PROCUREMENT_SOURCES, type StatewidePortalConfig } from "./statewideProcurementConfigs";
import { parseStatewideDetailHtml, parseStatewideListingContent, statewideCanonicalUrl, statewideHtmlToText, statewideMatchesOptions, statewideStableHash, statewideToOpportunity, type StatewideDetailRecord, type StatewideListingRecord } from "./statewideProcurementParser";

export { STATEWIDE_PORTAL_CONFIGS, STATEWIDE_PROCUREMENT_PORTAL_IDS, STATEWIDE_PROCUREMENT_SOURCES } from "./statewideProcurementConfigs";
export { parseStatewideDetailHtml, parseStatewideListingContent } from "./statewideProcurementParser";

class PublicPortalSession {
  private readonly cookies = new Map<string, string>();
  constructor(private readonly config: StatewidePortalConfig) {}

  private absorbCookies(headers: Headers): void {
    const extended = headers as Headers & { getSetCookie?: () => string[] };
    const values = extended.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
    for (const cookie of values) {
      const pair = cookie.split(";", 1)[0]?.trim();
      const equals = pair?.indexOf("=") ?? -1;
      if (pair && equals > 0) this.cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
  }

  private cookieHeader(): string | undefined {
    return this.cookies.size ? Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`).join("; ") : undefined;
  }

  private async request(url: string, timeoutMs: number): Promise<Response> {
    let current = sameOriginUrl(url, this.config.origin);
    if (!current) throw new Error(`${this.config.portalId} rejected a cross-origin URL`);
    for (let redirects = 0; redirects <= 6; redirects += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(current, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
            ...(this.cookieHeader() ? { cookie: this.cookieHeader() as string } : {}),
          },
        });
        this.absorbCookies(response.headers);
        if (response.status < 300 || response.status >= 400) return response;
        const location = response.headers.get("location");
        if (!location) return response;
        const next = sameOriginUrl(new URL(location, current).toString(), this.config.origin);
        if (!next) throw new Error(`${this.config.portalId} redirected outside its official origin`);
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
        const retryable = response.status === 429 || response.status >= 500;
        const message = `${label} returned HTTP ${response.status}${body ? `: ${statewideHtmlToText(body).slice(0, 160)}` : ""}`;
        if (!retryable || attempt >= maxRetries) throw new Error(message);
        const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
        await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 400 * 2 ** attempt));
        lastError = new Error(message);
      } catch (error) {
        lastError = error;
        if (attempt >= maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
      }
    }
    if (lastError instanceof Error) {
      if (lastError.name === "AbortError") throw new Error(`${label} timed out after ${timeoutMs}ms`);
      throw lastError;
    }
    throw new Error(`${label} request failed`);
  }
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
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

export class StatewideProcurementProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;
  constructor(readonly config: StatewidePortalConfig) {}
  async isConfigured(): Promise<boolean> { return true; }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("STATEWIDE_PORTAL_REQUEST_TIMEOUT_MS", 20_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_RETRIES", 2, 0, 2);
    const maxPages = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_PAGES", 5, 1, 10);
    const maxResults = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_RESULTS", 100, 1, 500);
    const detailConcurrency = positiveIntegerEnv("STATEWIDE_PORTAL_DETAIL_CONCURRENCY", 4, 1, 8);
    const offset = Math.max(options.offset ?? 0, 0);
    const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    const targetCount = Math.min(maxResults, offset + requestedLimit);
    const session = new PublicPortalSession(this.config);
    const queue = [this.config.listingUrl, ...(this.config.alternateListingUrls ?? [])];
    const seenPages = new Set<string>();
    const seenSignatures = new Set<string>();
    const listings = new Map<string, StatewideListingRecord>();
    const errors: string[] = [];
    let listingPage = 0;

    while (queue.length && listingPage < maxPages && listings.size < targetCount) {
      const pageUrl = queue.shift();
      if (!pageUrl) break;
      const safePageUrl = sameOriginUrl(pageUrl, this.config.origin);
      if (!safePageUrl) { errors.push(`${this.config.portalId}: rejected cross-origin listing URL ${pageUrl}`); continue; }
      const pageKey = statewideCanonicalUrl(safePageUrl).toLowerCase();
      if (seenPages.has(pageKey)) continue;
      seenPages.add(pageKey);
      let content: string;
      try {
        content = await session.fetchText(safePageUrl, timeoutMs, maxRetries, `${this.config.portalId} listing`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(listings.size ? `${this.config.portalId}: partial listing results after ${reason}` : `${this.config.portalId}: ${reason}`);
        continue;
      }
      const signature = statewideStableHash(statewideHtmlToText(content));
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);
      listingPage += 1;
      for (const listing of parseStatewideListingContent(content, this.config, safePageUrl, listingPage)) {
        if (!listings.has(listing.nativeId.toLowerCase())) listings.set(listing.nativeId.toLowerCase(), listing);
        if (listings.size >= targetCount) break;
      }
      if (listingPage >= maxPages || listings.size >= targetCount) continue;
      for (const nextUrl of extractSameOriginPaginationUrls(content, safePageUrl, this.config.origin, maxPages * 3)) {
        const key = statewideCanonicalUrl(nextUrl).toLowerCase();
        if (!seenPages.has(key) && !queue.some((queued) => statewideCanonicalUrl(queued).toLowerCase() === key)) queue.push(nextUrl);
      }
    }

    if (!listings.size && errors.length) {
      this.lastError = errors.join("; ");
      return { records: [], total: 0, errors };
    }

    const enriched = await mapConcurrent(Array.from(listings.values()).slice(0, targetCount), detailConcurrency, async (listing) => {
      let detail: StatewideDetailRecord | undefined;
      if (statewideCanonicalUrl(listing.detailUrl) !== statewideCanonicalUrl(this.config.listingUrl)) {
        try {
          const html = await session.fetchText(listing.detailUrl, timeoutMs, maxRetries, `${this.config.portalId} detail ${listing.nativeId}`);
          detail = parseStatewideDetailHtml(html, this.config, listing.detailUrl);
        } catch (error) {
          errors.push(`${this.config.portalId}:${listing.nativeId}: detail enrichment failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return statewideToOpportunity(this.config, listing, detail);
    });

    const seen = new Set<string>();
    const records = enriched.filter((record): record is NormalizedOpportunity => Boolean(record)).filter((record) => statewideMatchesOptions(record, options)).filter((record) => { if (seen.has(record.externalId)) return false; seen.add(record.externalId); return true; }).slice(offset, offset + requestedLimit);
    this.recordCount = records.length;
    this.lastError = errors.length && !records.length ? errors.join("; ") : undefined;
    if (records.length || !errors.length) this.lastSuccess = new Date();
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    return { name: this.name, configured: true, healthy: !this.lastError, errorMessage: this.lastError, lastAttempt: this.lastAttempt, lastSuccess: this.lastSuccess, recordCount: this.recordCount };
  }
}

export const statewideProcurementProviders: Record<string, StatewideProcurementProvider> = Object.fromEntries(STATEWIDE_PORTAL_CONFIGS.map((config) => [config.portalId, new StatewideProcurementProvider(config)]));
export function statewideProcurementProvider(portalId: string): StatewideProcurementProvider | undefined { return statewideProcurementProviders[portalId]; }
