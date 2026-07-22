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
const CRAWLER_ONLY_SCRAPER_TYPES = new Set([
  "rss",
  "public_json",
  "playwright_public",
  "scrapy",
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

function crawlerSources(): PublicPortalSource[] {
  initializeCrawlerSpiders();
  return basePublicPortalProvider
    .getSources()
    .filter(
      (source) =>
        source.enabled &&
        source.verificationStatus === "verified" &&
        CRAWLER_ONLY_SCRAPER_TYPES.has(source.scraperType) &&
        (source.scraperType !== "playwright_public" || browserDiscoveryEnabled()) &&
        Boolean(defaultSpiderConfigForSource(source)),
    );
}

async function selectedCrawlerSources(): Promise<PublicPortalSource[]> {
  const sources = crawlerSources();
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

class CrawlerAugmentedPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    return (
      (await basePublicPortalProvider.isConfigured().catch(() => false)) ||
      crawlerSources().length > 0
    );
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const crawlerRecords: NormalizedOpportunity[] = [];
    const crawlerErrors: string[] = [];
    const selected = await selectedCrawlerSources();
    const concurrency = positiveIntegerEnv(
      "PUBLIC_PORTAL_CRAWLER_CONCURRENCY",
      DEFAULT_CRAWLER_CONCURRENCY,
      1,
      4,
    );

    const crawlerTask = runWithConcurrency(
      selected,
      concurrency,
      async (source) => {
        try {
          const result = await runCrawlerForSource(source, {
            signal: options.signal,
          });
          if (!result || result.outcome === "deferred") return;
          crawlerRecords.push(...result.records);
          if (result.outcome === "failed" || result.outcome === "blocked") {
            crawlerErrors.push(
              `${source.id}: ${result.diagnostics.errors.join("; ") || result.outcome}`,
            );
          }
        } catch (error) {
          crawlerErrors.push(
            `${source.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
      options.signal,
    );

    const [baseResult] = await Promise.all([
      basePublicPortalProvider.fetch(options),
      crawlerTask,
    ]);
    const seen = new Set<string>();
    const merged = [...baseResult.records, ...crawlerRecords].filter((record) => {
      const key = recordKey(record);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const records = merged.slice(0, limit);
    return {
      records,
      total: records.length,
      errors: [...baseResult.errors, ...crawlerErrors],
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const base = await basePublicPortalProvider.getStatus();
    const activeCrawlerSourceIds = new Set(
      crawlerSources().map((source) => source.id),
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
