import { nyScrProvider } from "../nyScr";
import { texasEsbdProvider } from "../texasEsbd";
import { openGovTenantProvider, OPENGOV_PORTAL_IDS } from "../openGov";
import { publicPortalDiscovery } from "../publicPortalDiscovery";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "../types";
import { PUBLIC_PORTAL_SOURCES, type PublicPortalSource, validatePublicPortalSource } from "./catalog";
import { extractPaginationUrls, extractPdfLinkOpportunities, extractStaticHtmlOpportunities, withPublicPortalMetadata } from "./genericExtractors";

export interface PublicPortalSourceRunStatus {
  sourceId: string;
  lastCheckedAt: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastFailureReason?: string;
  resultCount: number;
  matchedCount: number;
}

const DEFAULT_LIMIT = 100;
const MIN_DOMAIN_INTERVAL_MS = 1_000;
const DEFAULT_SOURCE_TIMEOUT_MS = 25_000;
const DEFAULT_RUN_TIMEOUT_MS = 90_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_PAGES = 3;
const lastDomainFetchAt = new Map<string, number>();
const sourceStatuses = new Map<string, PublicPortalSourceRunStatus>();

// Build the SOURCE_ADAPTERS map. OpenGov portal IDs are registered lazily via
// openGovTenantProvider() so each portal ID gets a single-tenant provider
// instance without listing them all inline again.
const SOURCE_ADAPTERS: Record<string, DataSourceProvider> = (() => {
  const adapters: Record<string, DataSourceProvider> = {
    "tx-esbd": texasEsbdProvider,
    "ny-contract-reporter": nyScrProvider,
  };
  for (const portalId of OPENGOV_PORTAL_IDS) {
    const provider = openGovTenantProvider(portalId);
    if (provider) adapters[portalId] = provider;
  }
  return adapters;
})();

function positiveIntegerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function isOccuMedMatch(record: NormalizedOpportunity): boolean {
  return Boolean(record.rawData?.occuMedMatched);
}

function sourceIdForRecord(record: NormalizedOpportunity): string | undefined {
  const value = record.rawData?.sourceId ?? record.rawData?.parsedPortalSourceId;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function opportunityKey(record: NormalizedOpportunity): string {
  if (record.sourceUrl) {
    try {
      const parsed = new URL(record.sourceUrl);
      return `url:${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname.replace(/\/$/, "").toLowerCase()}${parsed.search.toLowerCase()}`;
    } catch {
      return `url:${record.sourceUrl.toLowerCase()}`;
    }
  }
  if (record.solicitationNumber) return `sol:${record.solicitationNumber.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  return `id:${record.externalId.toLowerCase()}`;
}

function normalizedPageUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString().toLowerCase();
  } catch {
    return value.toLowerCase().replace(/#.*$/, "");
  }
}

async function waitForDomainRateLimit(domain: string): Promise<void> {
  const lastFetchAt = lastDomainFetchAt.get(domain) ?? 0;
  const waitMs = Math.max(0, MIN_DOMAIN_INTERVAL_MS - (Date.now() - lastFetchAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastDomainFetchAt.set(domain, Date.now());
}

async function withTimeout<T>(task: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchHtml(source: PublicPortalSource, pageUrl: string, timeoutMs: number): Promise<string> {
  let domain = source.domain;
  try {
    domain = new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    // The catalog validator already checks the source URL. Keep the catalog
    // domain as a safe rate-limit key if a discovered pagination URL is invalid.
  }

  await waitForDomainRateLimit(domain);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "OccuMed-InsightHub/1.0 public procurement catalog crawler (+https://www.occumed.com)",
      },
    });
    if (!response.ok) throw new Error(`${source.id} returned HTTP ${response.status} for ${pageUrl}`);
    return response.text();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${source.id} timed out after ${timeoutMs}ms for ${pageUrl}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function runExistingParser(source: PublicPortalSource, options: FetchOptions): Promise<NormalizedOpportunity[]> {
  const adapter = SOURCE_ADAPTERS[source.id];
  if (adapter) return (await adapter.fetch(options)).records.map((record) => withPublicPortalMetadata(record, source));
  throw new Error(`No dedicated source adapter is registered for public portal source ${source.id}`);
}

type PortalPageExtractor = (
  html: string,
  source: PublicPortalSource,
  limit: number,
) => NormalizedOpportunity[];

async function runPaginatedHtmlSource(
  source: PublicPortalSource,
  limit: number,
  timeoutMs: number,
  maxPages: number,
  extractor: PortalPageExtractor,
): Promise<NormalizedOpportunity[]> {
  const startedAt = Date.now();
  const queue: string[] = [source.sourceUrl];
  const seenPages = new Set<string>();
  const seenRecords = new Set<string>();
  const records: NormalizedOpportunity[] = [];
  let pagesFetched = 0;

  while (queue.length > 0 && pagesFetched < maxPages && records.length < limit) {
    const pageUrl = queue.shift();
    if (!pageUrl) break;
    const pageKey = normalizedPageUrl(pageUrl);
    if (seenPages.has(pageKey)) continue;
    seenPages.add(pageKey);

    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;

    let html: string;
    try {
      html = await fetchHtml(source, pageUrl, remainingMs);
    } catch (error) {
      if (records.length === 0) throw error;
      break;
    }

    pagesFetched += 1;
    const pageSource: PublicPortalSource = { ...source, sourceUrl: pageUrl };
    const pageRecords = extractor(html, pageSource, Math.max(1, limit - records.length));

    for (const record of pageRecords) {
      const key = opportunityKey(record);
      if (seenRecords.has(key)) continue;
      seenRecords.add(key);
      records.push({
        ...record,
        rawData: {
          ...(record.rawData ?? {}),
          listingPageUrl: pageUrl,
          listingPageNumber: pagesFetched,
          paginationMode: "bounded_same_domain",
        },
      });
      if (records.length >= limit) break;
    }

    if (pagesFetched >= maxPages || records.length >= limit) continue;
    const nextUrls = extractPaginationUrls(
      html,
      pageUrl,
      source.domain,
      Math.max(maxPages * 3, 6),
    );
    for (const nextUrl of nextUrls) {
      const nextKey = normalizedPageUrl(nextUrl);
      if (!seenPages.has(nextKey) && !queue.some((queued) => normalizedPageUrl(queued) === nextKey)) {
        queue.push(nextUrl);
      }
    }
  }

  return records.slice(0, limit);
}

async function runSource(
  source: PublicPortalSource,
  options: FetchOptions,
  timeoutMs: number,
  maxPages: number,
): Promise<NormalizedOpportunity[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);
  if (SOURCE_ADAPTERS[source.id]) return runExistingParser(source, { ...options, limit });
  if (source.scraperType === "existing_parser") return runExistingParser(source, { ...options, limit });
  if (source.scraperType === "static_html") {
    return runPaginatedHtmlSource(source, limit, timeoutMs, maxPages, extractStaticHtmlOpportunities);
  }
  if (source.scraperType === "pdf_links") {
    return runPaginatedHtmlSource(source, limit, timeoutMs, maxPages, extractPdfLinkOpportunities);
  }
  if (source.scraperType === "scrapy") throw new Error(`Scrapy source ${source.id} is reserved until a real spider is added`);
  if (source.scraperType === "playwright_public") throw new Error(`Playwright source ${source.id} is reserved until a real public-page runner is added`);
  if (source.scraperType === "rss" || source.scraperType === "public_json") throw new Error(`${source.scraperType} source ${source.id} needs a concrete adapter before it can run`);
  return [];
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), Math.max(items.length, 1));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        const item = items[index];
        if (item === undefined) return;
        await worker(item, index);
      }
    }),
  );
}

export class PublicPortalProvidersProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  constructor(private readonly sources: PublicPortalSource[] = PUBLIC_PORTAL_SOURCES) {}

  async isConfigured(): Promise<boolean> { return true; }

  getSources(): PublicPortalSource[] { return this.sources; }

  getSourceStatuses(): PublicPortalSourceRunStatus[] { return Array.from(sourceStatuses.values()); }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const enabledSources = this.sources.filter(
      (source) => source.enabled && source.verificationStatus === "verified",
    );
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const sourceTimeoutMs = positiveIntegerEnv("PUBLIC_PORTAL_SOURCE_TIMEOUT_MS", DEFAULT_SOURCE_TIMEOUT_MS, 5_000, 120_000);
    const runTimeoutMs = positiveIntegerEnv("PUBLIC_PORTAL_RUN_TIMEOUT_MS", DEFAULT_RUN_TIMEOUT_MS, 15_000, 300_000);
    const concurrency = positiveIntegerEnv("PUBLIC_PORTAL_CONCURRENCY", DEFAULT_CONCURRENCY, 1, 10);
    const maxPages = positiveIntegerEnv("PUBLIC_PORTAL_MAX_PAGES", DEFAULT_MAX_PAGES, 1, 10);
    const runDeadlineAt = Date.now() + runTimeoutMs;
    const resultLimit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);

    await runWithConcurrency(enabledSources, concurrency, async (source) => {
      const lastCheckedAt = new Date();
      const validationErrors = validatePublicPortalSource(source);
      if (validationErrors.length) {
        const reason = validationErrors.join("; ");
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: lastCheckedAt, lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
        return;
      }

      const remainingMs = runDeadlineAt - Date.now();
      if (remainingMs <= 0) {
        const reason = "provider run deadline reached before this source started";
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: lastCheckedAt, lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
        return;
      }

      const effectiveTimeout = Math.min(sourceTimeoutMs, remainingMs);
      try {
        const sourceRecords = await withTimeout(
          () => runSource(source, options, effectiveTimeout, maxPages),
          effectiveTimeout,
          source.id,
        );
        records.push(...sourceRecords);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastSuccessAt: new Date(), resultCount: sourceRecords.length, matchedCount: sourceRecords.filter(isOccuMedMatch).length });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${source.id}: ${reason}`);
        sourceStatuses.set(source.id, { sourceId: source.id, lastCheckedAt, lastFailureAt: new Date(), lastFailureReason: reason, resultCount: 0, matchedCount: 0 });
      }
    });

    const remainingForDiscovery = runDeadlineAt - Date.now();
    if (remainingForDiscovery <= 0) {
      errors.push("serper-official-portal-discovery: skipped because the provider run deadline was reached");
    } else if (await publicPortalDiscovery.isConfigured()) {
      try {
        const discoveredPages = await withTimeout(
          () => publicPortalDiscovery.search({ keywords: options.keywords }),
          Math.min(sourceTimeoutMs, remainingForDiscovery),
          "serper-official-portal-discovery",
        );
        const sourceById = new Map(this.sources.map((source) => [source.id, source]));
        const seen = new Set(records.map(opportunityKey));
        const discoveredRecords = publicPortalDiscovery.toOpportunities(discoveredPages);

        for (const discovered of discoveredRecords) {
          const sourceId = sourceIdForRecord(discovered);
          const source = sourceId ? sourceById.get(sourceId) : undefined;
          const normalized: NormalizedOpportunity = source
            ? withPublicPortalMetadata({
                ...discovered,
                source: "publicPortalProviders",
                providerName: "publicPortalProviders",
                rawData: { ...(discovered.rawData ?? {}), discoveryMethod: "serper_official_portal", serperFallback: true },
              }, source)
            : {
                ...discovered,
                source: "publicPortalProviders",
                providerName: "publicPortalProviders",
                rawData: {
                  ...(discovered.rawData ?? {}),
                  providerFamily: "public_portal",
                  providerType: "serper_official_portal",
                  sourceBadge: "Public Portal Search",
                  discoveryMethod: "serper_official_portal",
                  serperFallback: true,
                },
              };

          const key = opportunityKey(normalized);
          if (seen.has(key)) continue;
          seen.add(key);
          records.push(normalized);

          if (sourceId) {
            const prior = sourceStatuses.get(sourceId);
            const succeededAt = new Date();
            sourceStatuses.set(sourceId, {
              sourceId,
              lastCheckedAt: prior?.lastCheckedAt ?? succeededAt,
              lastSuccessAt: succeededAt,
              lastFailureAt: prior?.lastFailureAt,
              lastFailureReason: prior?.lastFailureReason,
              resultCount: (prior?.resultCount ?? 0) + 1,
              matchedCount: (prior?.matchedCount ?? 0) + (isOccuMedMatch(normalized) ? 1 : 0),
            });
          }
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`serper-official-portal-discovery: ${reason}`);
      }
    }

    const limitedRecords = records.slice(0, resultLimit);
    return { records: limitedRecords, total: limitedRecords.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    const statuses = Array.from(sourceStatuses.values());
    const hasCurrentFailure = statuses.some((status) => status.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt));
    return { name: this.name, configured: true, healthy: !hasCurrentFailure, recordCount: statuses.reduce((sum, status) => sum + status.resultCount, 0) };
  }
}

export const publicPortalProvidersProvider = new PublicPortalProvidersProvider();
export * from "./catalog";
export * from "./genericExtractors";
