import { nyScrProvider } from "../nyScr";
import { texasEsbdProvider } from "../texasEsbd";
import { bsoPortalProviders } from "../bsoPortal";
import { bonfireTenantProvider, BONFIRE_COLLECTIBLE_PORTAL_IDS } from "../bonfirePortal";
import { civicEngageTenantProvider, CIVICENGAGE_PORTAL_IDS } from "../civicEngageBids";
import { ionWaveTenantProvider, IONWAVE_COLLECTIBLE_PORTAL_IDS } from "../ionWavePortal";
import { jaggaerSciQuestTenantProvider, JAGGAER_COLLECTIBLE_PORTAL_IDS } from "../jaggaerSciQuest";
import { openGovTenantProvider, OPENGOV_PORTAL_IDS } from "../openGov";
import { publicPortalDiscovery } from "../publicPortalDiscovery";
import { composeAbortSignal } from "../abortSignals";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "../types";
import { PUBLIC_PORTAL_SOURCES, type PublicPortalSource, validatePublicPortalSource } from "./catalog";
import { extractPaginationUrls, extractPdfLinkOpportunities, extractStaticHtmlOpportunities, withPublicPortalMetadata } from "./genericExtractors";
import {
  failedPortalStatus,
  loadPublicPortalHealth,
  savePublicPortalHealth,
  selectFairPortalSources,
  successfulPortalStatus,
  type PublicPortalSourceRunStatus,
} from "./portalHealthStore";

export type { PublicPortalSourceRunStatus } from "./portalHealthStore";

const DEFAULT_LIMIT = 100;
const MIN_DOMAIN_INTERVAL_MS = 1_000;
const DEFAULT_SOURCE_TIMEOUT_MS = 25_000;
const DEFAULT_RUN_TIMEOUT_MS = 90_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_PAGES = 3;
const DEFAULT_ROTATION_BATCH_SIZE = 10;
const lastDomainFetchAt = new Map<string, number>();
const sourceStatuses = new Map<string, PublicPortalSourceRunStatus>();

// Build the SOURCE_ADAPTERS map. OpenGov portal IDs are registered lazily via
// openGovTenantProvider() so each portal ID gets a single-tenant provider
// instance without listing them all inline again.
const SOURCE_ADAPTERS: Record<string, DataSourceProvider> = (() => {
  const adapters: Record<string, DataSourceProvider> = {
    "tx-esbd": texasEsbdProvider,
    "ny-contract-reporter": nyScrProvider,
    ...bsoPortalProviders,
  };
  for (const portalId of OPENGOV_PORTAL_IDS) {
    const provider = openGovTenantProvider(portalId);
    if (provider) adapters[portalId] = provider;
  }
  for (const portalId of JAGGAER_COLLECTIBLE_PORTAL_IDS) {
    const provider = jaggaerSciQuestTenantProvider(portalId);
    if (provider) adapters[portalId] = provider;
  }
  for (const portalId of BONFIRE_COLLECTIBLE_PORTAL_IDS) {
    const provider = bonfireTenantProvider(portalId);
    if (provider) adapters[portalId] = provider;
  }
  for (const portalId of IONWAVE_COLLECTIBLE_PORTAL_IDS) {
    const provider = ionWaveTenantProvider(portalId);
    if (provider) adapters[portalId] = provider;
  }
  for (const portalId of CIVICENGAGE_PORTAL_IDS) {
    const provider = civicEngageTenantProvider(portalId);
    if (provider) adapters[portalId] = provider;
  }
  return adapters;
})();

const DEDICATED_SOURCE_IDS = new Set(Object.keys(SOURCE_ADAPTERS));
const ALWAYS_RUN_SOURCE_IDS = new Set(
  Array.from(DEDICATED_SOURCE_IDS).filter((sourceId) => !CIVICENGAGE_PORTAL_IDS.has(sourceId)),
);

export function isDedicatedPublicPortalSourceId(sourceId: string): boolean {
  return DEDICATED_SOURCE_IDS.has(sourceId);
}

function positiveIntegerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function isRunnableSource(source: PublicPortalSource): boolean {
  return Boolean(SOURCE_ADAPTERS[source.id])
    || source.scraperType === "static_html"
    || source.scraperType === "pdf_links";
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

async function hydrateSourceStatuses(): Promise<void> {
  const persisted = await loadPublicPortalHealth();
  for (const [sourceId, status] of persisted) sourceStatuses.set(sourceId, status);
}

async function rememberSourceStatus(
  status: PublicPortalSourceRunStatus,
  errors: string[],
): Promise<void> {
  sourceStatuses.set(status.sourceId, status);
  try {
    await savePublicPortalHealth(status);
  } catch (error) {
    errors.push(
      `${status.sourceId}: portal health persistence failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function abortError(label: string, signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return new Error(`${label} cancelled`);
}

async function waitForDomainRateLimit(domain: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError(`Rate limit wait for ${domain}`, signal);
  const lastFetchAt = lastDomainFetchAt.get(domain) ?? 0;
  const waitMs = Math.max(0, MIN_DOMAIN_INTERVAL_MS - (Date.now() - lastFetchAt));
  if (waitMs > 0) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener("abort", onAbort);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, waitMs);
      const onAbort = () => {
        clearTimeout(timer);
        cleanup();
        reject(abortError(`Rate limit wait for ${domain}`, signal));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }
  if (signal?.aborted) throw abortError(`Rate limit wait for ${domain}`, signal);
  lastDomainFetchAt.set(domain, Date.now());
}

async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number, label: string, parentSignal?: AbortSignal): Promise<T> {
  const requestSignal = composeAbortSignal(timeoutMs, parentSignal);
  try {
    return await task(requestSignal.signal);
  } catch (error) {
    if (requestSignal.signal.aborted) {
      const reason = requestSignal.signal.reason;
      if (reason instanceof DOMException && reason.name === "TimeoutError") {
        throw new Error(`${label} timed out after ${timeoutMs}ms`);
      }
      if (reason instanceof Error) throw reason;
      throw new Error(`${label} cancelled`);
    }
    throw error;
  } finally {
    requestSignal.cleanup();
  }
}

async function fetchHtml(source: PublicPortalSource, pageUrl: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  let domain = source.domain;
  try {
    domain = new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    // The catalog validator already checks the source URL. Keep the catalog
    // domain as a safe rate-limit key if a discovered pagination URL is invalid.
  }

  await waitForDomainRateLimit(domain, signal);
  const requestSignal = composeAbortSignal(timeoutMs, signal);
  try {
    const response = await fetch(pageUrl, {
      signal: requestSignal.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "OccuMed-InsightHub/1.0 public procurement catalog crawler (+https://www.occumed.com)",
      },
    });
    if (!response.ok) throw new Error(`${source.id} returned HTTP ${response.status} for ${pageUrl}`);
    return response.text();
  } catch (error) {
    if (requestSignal.signal.aborted) {
      const reason = requestSignal.signal.reason;
      if (reason instanceof DOMException && reason.name === "TimeoutError") {
        throw new Error(`${source.id} timed out after ${timeoutMs}ms for ${pageUrl}`);
      }
      if (reason instanceof Error) throw reason;
      throw new Error(`${source.id} cancelled for ${pageUrl}`);
    }
    throw error;
  } finally {
    requestSignal.cleanup();
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
  signal?: AbortSignal,
): Promise<NormalizedOpportunity[]> {
  const startedAt = Date.now();
  const queue: string[] = [source.sourceUrl];
  const seenPages = new Set<string>();
  const seenRecords = new Set<string>();
  const records: NormalizedOpportunity[] = [];
  let pagesFetched = 0;

  while (queue.length > 0 && pagesFetched < maxPages && records.length < limit) {
    if (signal?.aborted) throw abortError(source.id, signal);
    const pageUrl = queue.shift();
    if (!pageUrl) break;
    const pageKey = normalizedPageUrl(pageUrl);
    if (seenPages.has(pageKey)) continue;
    seenPages.add(pageKey);

    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;

    let html: string;
    try {
      html = await fetchHtml(source, pageUrl, remainingMs, signal);
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
  if (options.signal?.aborted) throw abortError(source.id, options.signal);
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);
  if (SOURCE_ADAPTERS[source.id]) return runExistingParser(source, { ...options, limit });
  if (source.scraperType === "existing_parser") return runExistingParser(source, { ...options, limit });
  if (source.scraperType === "static_html") {
    return runPaginatedHtmlSource(source, limit, timeoutMs, maxPages, extractStaticHtmlOpportunities, options.signal);
  }
  if (source.scraperType === "pdf_links") {
    return runPaginatedHtmlSource(source, limit, timeoutMs, maxPages, extractPdfLinkOpportunities, options.signal);
  }
  throw new Error(`Source ${source.id} does not have a runnable direct or generic public-page adapter`);
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), Math.max(items.length, 1));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        if (signal?.aborted) return;
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

  async isConfigured(): Promise<boolean> {
    return this.sources.some(
      (source) => source.enabled
        && source.verificationStatus === "verified"
        && isRunnableSource(source),
    );
  }

  getSources(): PublicPortalSource[] { return this.sources; }

  getSourceStatuses(): PublicPortalSourceRunStatus[] {
    return Array.from(sourceStatuses.values()).sort(
      (left, right) => right.lastCheckedAt.getTime() - left.lastCheckedAt.getTime(),
    );
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];

    try {
      await hydrateSourceStatuses();
    } catch (error) {
      errors.push(`portal-health-load: ${error instanceof Error ? error.message : String(error)}`);
    }

    const enabledSources = this.sources.filter(
      (source) => source.enabled
        && source.verificationStatus === "verified"
        && isRunnableSource(source),
    );
    const sourceTimeoutMs = positiveIntegerEnv("PUBLIC_PORTAL_SOURCE_TIMEOUT_MS", DEFAULT_SOURCE_TIMEOUT_MS, 5_000, 120_000);
    const runTimeoutMs = positiveIntegerEnv("PUBLIC_PORTAL_RUN_TIMEOUT_MS", DEFAULT_RUN_TIMEOUT_MS, 15_000, 300_000);
    const concurrency = positiveIntegerEnv("PUBLIC_PORTAL_CONCURRENCY", DEFAULT_CONCURRENCY, 1, 10);
    const maxPages = positiveIntegerEnv("PUBLIC_PORTAL_MAX_PAGES", DEFAULT_MAX_PAGES, 1, 10);
    const rotationBatchSize = positiveIntegerEnv(
      "PUBLIC_PORTAL_ROTATION_BATCH_SIZE",
      DEFAULT_ROTATION_BATCH_SIZE,
      1,
      100,
    );
    const { selected: selectedSources } = selectFairPortalSources(
      enabledSources,
      sourceStatuses,
      rotationBatchSize,
      ALWAYS_RUN_SOURCE_IDS,
    );
    const runDeadlineAt = Date.now() + runTimeoutMs;
    const resultLimit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);

    await runWithConcurrency(selectedSources, concurrency, async (source) => {
      const checkedAt = new Date();
      const prior = sourceStatuses.get(source.id);
      const validationErrors = validatePublicPortalSource(source);
      if (validationErrors.length) {
        const reason = validationErrors.join("; ");
        errors.push(`${source.id}: ${reason}`);
        await rememberSourceStatus(
          failedPortalStatus(source, prior, checkedAt, reason, "validation_failed"),
          errors,
        );
        return;
      }

      const remainingMs = runDeadlineAt - Date.now();
      if (remainingMs <= 0) {
        errors.push(`${source.id}: provider run deadline reached before this source started; it remains first in the next rotation`);
        return;
      }

      const effectiveTimeout = Math.min(sourceTimeoutMs, remainingMs);
      try {
        const sourceRecords = await withTimeout(
          (signal) => runSource(source, { ...options, signal }, effectiveTimeout, maxPages),
          effectiveTimeout,
          source.id,
          options.signal,
        );
        records.push(...sourceRecords);
        const completedAt = new Date();
        await rememberSourceStatus(
          successfulPortalStatus(
            source,
            prior,
            completedAt,
            sourceRecords.length,
            sourceRecords.filter(isOccuMedMatch).length,
          ),
          errors,
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${source.id}: ${reason}`);
        await rememberSourceStatus(
          failedPortalStatus(source, prior, new Date(), reason),
          errors,
        );
      }
    }, options.signal);

    const remainingForDiscovery = runDeadlineAt - Date.now();
    if (remainingForDiscovery <= 0) {
      errors.push("serper-official-portal-discovery: skipped because the provider run deadline was reached");
    } else if (await publicPortalDiscovery.isConfigured()) {
      try {
        const discoveredPages = await withTimeout(
          (signal) => publicPortalDiscovery.search({ keywords: options.keywords, signal }),
          Math.min(sourceTimeoutMs, remainingForDiscovery),
          "serper-official-portal-discovery",
          options.signal,
        );
        const sourceById = new Map(this.sources.map((source) => [source.id, source]));
        const seen = new Set(records.map(opportunityKey));
        const discoveredRecords = publicPortalDiscovery.toOpportunities(discoveredPages);

        for (const discovered of discoveredRecords) {
          const sourceId = sourceIdForRecord(discovered);
          if (sourceId && DEDICATED_SOURCE_IDS.has(sourceId)) continue;
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
    try {
      await hydrateSourceStatuses();
    } catch {
      // Status can still use the in-process cache when durable health is temporarily unavailable.
    }
    const statuses = Array.from(sourceStatuses.values());
    const configured = await this.isConfigured();
    const currentFailures = statuses.filter(
      (status) => status.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt),
    );
    const lastAttempt = statuses.reduce<Date | undefined>(
      (latest, status) => !latest || status.lastCheckedAt > latest ? status.lastCheckedAt : latest,
      undefined,
    );
    const lastSuccess = statuses.reduce<Date | undefined>(
      (latest, status) => status.lastSuccessAt && (!latest || status.lastSuccessAt > latest) ? status.lastSuccessAt : latest,
      undefined,
    );
    return {
      name: this.name,
      configured,
      healthy: configured && currentFailures.length === 0,
      errorMessage: currentFailures.length > 0
        ? `${currentFailures.length} runnable portal source${currentFailures.length === 1 ? " is" : "s are"} currently failing`
        : undefined,
      recordCount: statuses.reduce((sum, status) => sum + status.resultCount, 0),
      lastAttempt,
      lastSuccess,
    };
  }
}

export const publicPortalProvidersProvider = new PublicPortalProvidersProvider();
export * from "./catalog";
export * from "./genericExtractors";
