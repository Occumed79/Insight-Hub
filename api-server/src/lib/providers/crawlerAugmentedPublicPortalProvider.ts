import {
  defaultSpiderConfigForSource,
  ensureSourceSpiderConfig,
  initializeCrawlerSpiders,
  listCrawlFrontier,
  runCrawlerForSource,
  type CrawlFrontierState,
} from "../crawler";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { publicPortalProvidersProvider as basePublicPortalProvider } from "./publicPortalProviders";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

const DEFAULT_CRAWLER_BATCH_SIZE = 6;
const DEFAULT_CRAWLER_CONCURRENCY = 2;
const AUGMENTED_SCRAPER_TYPES = new Set([
  "rss",
  "public_json",
  "playwright_public",
  "scrapy",
]);
const SCHEDULED_SCRAPER_TYPES = new Set([
  ...AUGMENTED_SCRAPER_TYPES,
  "static_html",
  "pdf_links",
]);

function positiveIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function browserDiscoveryEnabled(): boolean {
  return process.env.PUBLIC_PORTAL_BROWSER_DISCOVERY_ENABLED === "true";
}

function recordKey(record: NormalizedOpportunity): string {
  if (record.sourceUrl) {
    try {
      const url = new URL(record.sourceUrl);
      url.hash = "";
      return `url:${url.toString().toLowerCase()}`;
    } catch {
      return `url:${record.sourceUrl.toLowerCase()}`;
    }
  }
  if (record.solicitationNumber) {
    return `sol:${record.solicitationNumber.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  }
  return `id:${record.externalId.toLowerCase()}`;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = 0;
  const workers = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < items.length && !signal?.aborted) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (item === undefined) return;
        await worker(item);
      }
    }),
  );
}

function crawlerSources(
  scraperTypes: ReadonlySet<string>,
): PublicPortalSource[] {
  initializeCrawlerSpiders();
  return basePublicPortalProvider
    .getSources()
    .filter(
      (source) =>
        source.enabled &&
        source.verificationStatus === "verified" &&
        scraperTypes.has(source.scraperType) &&
        (source.scraperType !== "playwright_public" || browserDiscoveryEnabled()) &&
        Boolean(defaultSpiderConfigForSource(source)),
    );
}

async function selectedCrawlerSources(
  scraperTypes: ReadonlySet<string>,
): Promise<PublicPortalSource[]> {
  const sources = crawlerSources(scraperTypes);
  for (const source of sources) ensureSourceSpiderConfig(source);
  const frontier = await listCrawlFrontier().catch(
    () => [] as CrawlFrontierState[],
  );
  const frontierBySource = new Map(
    frontier.map((state) => [state.sourceId, state]),
  );
  const now = Date.now();
  const batchSize = positiveIntegerEnv(
    "PUBLIC_PORTAL_CRAWLER_BATCH_SIZE",
    DEFAULT_CRAWLER_BATCH_SIZE,
    1,
    25,
  );
  return sources
    .filter((source) => {
      const state = frontierBySource.get(source.id);
      if (!state) return true;
      const nextRunAt = new Date(state.nextRunAt).getTime();
      return Number.isNaN(nextRunAt) || nextRunAt <= now;
    })
    .sort((left, right) => {
      const leftState = frontierBySource.get(left.id);
      const rightState = frontierBySource.get(right.id);
      const leftAttempt = leftState?.lastAttemptAt
        ? new Date(leftState.lastAttemptAt).getTime()
        : 0;
      const rightAttempt = rightState?.lastAttemptAt
        ? new Date(rightState.lastAttemptAt).getTime()
        : 0;
      return leftAttempt - rightAttempt || left.id.localeCompare(right.id);
    })
    .slice(0, batchSize);
}

async function fetchSelectedCrawlerSources(
  selected: PublicPortalSource[],
  options: FetchOptions,
): Promise<ProviderFetchResult> {
  const records: NormalizedOpportunity[] = [];
  const errors: string[] = [];
  const concurrency = positiveIntegerEnv(
    "PUBLIC_PORTAL_CRAWLER_CONCURRENCY",
    DEFAULT_CRAWLER_CONCURRENCY,
    1,
    4,
  );

  await runWithConcurrency(
    selected,
    concurrency,
    async (source) => {
      try {
        const result = await runCrawlerForSource(source, {
          signal: options.signal,
        });
        if (!result || result.outcome === "deferred") return;
        records.push(...result.records);
        if (result.diagnostics.errors.length > 0) {
          const prefix = result.records.length > 0
            ? `partial results retained (${result.records.length})`
            : result.outcome;
          errors.push(
            `${source.id}: ${prefix}: ${result.diagnostics.errors.join("; ")}`,
          );
        } else if (result.outcome === "failed" || result.outcome === "blocked") {
          errors.push(`${source.id}: ${result.outcome}`);
        }
      } catch (error) {
        errors.push(
          `${source.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    options.signal,
  );

  const seen = new Set<string>();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
  const deduped = records
    .filter((record) => {
      const key = recordKey(record);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
  return { records: deduped, total: deduped.length, errors };
}

export async function listDueCrawlerSourceIds(): Promise<string[]> {
  return (await selectedCrawlerSources(SCHEDULED_SCRAPER_TYPES)).map(
    (source) => source.id,
  );
}

export async function fetchDueCrawlerRecords(
  options: FetchOptions = {},
): Promise<ProviderFetchResult> {
  const selected = await selectedCrawlerSources(SCHEDULED_SCRAPER_TYPES);
  return fetchSelectedCrawlerSources(selected, options);
}

class CrawlerAugmentedPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    return (
      (await basePublicPortalProvider.isConfigured().catch(() => false)) ||
      crawlerSources(AUGMENTED_SCRAPER_TYPES).length > 0
    );
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const selected = await selectedCrawlerSources(AUGMENTED_SCRAPER_TYPES);
    const [baseResult, crawlerResult] = await Promise.all([
      basePublicPortalProvider.fetch(options),
      fetchSelectedCrawlerSources(selected, options),
    ]);
    const seen = new Set<string>();
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const records = [...baseResult.records, ...crawlerResult.records]
      .filter((record) => {
        const key = recordKey(record);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
    return {
      records,
      total: records.length,
      errors: [...baseResult.errors, ...crawlerResult.errors],
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const base = await basePublicPortalProvider.getStatus();
    const activeCrawlerSourceIds = new Set(
      crawlerSources(SCHEDULED_SCRAPER_TYPES).map((source) => source.id),
    );
    const frontier = (
      await listCrawlFrontier().catch(() => [] as CrawlFrontierState[])
    ).filter((state) => activeCrawlerSourceIds.has(state.sourceId));
    const crawlerFailures = frontier.filter(
      (state) => state.lastOutcome === "failed" || state.lastOutcome === "blocked",
    );
    return {
      ...base,
      healthy: base.healthy && crawlerFailures.length === 0,
      errorMessage:
        [
          base.errorMessage,
          crawlerFailures.length > 0
            ? `${crawlerFailures.length} crawler source${crawlerFailures.length === 1 ? " is" : "s are"} currently failing`
            : undefined,
        ]
          .filter(Boolean)
          .join("; ") || undefined,
      recordCount:
        (base.recordCount ?? 0) +
        frontier.reduce((sum, state) => sum + state.recordsFound, 0),
      lastAttempt: frontier.reduce<Date | undefined>((latest, state) => {
        if (!state.lastAttemptAt) return latest;
        const attempt = new Date(state.lastAttemptAt);
        return !latest || attempt > latest ? attempt : latest;
      }, base.lastAttempt),
      lastSuccess: frontier.reduce<Date | undefined>((latest, state) => {
        if (!state.lastSuccessAt) return latest;
        const success = new Date(state.lastSuccessAt);
        return !latest || success > latest ? success : latest;
      }, base.lastSuccess),
    };
  }
}

export const crawlerAugmentedPublicPortalProvider =
  new CrawlerAugmentedPublicPortalProvider();
