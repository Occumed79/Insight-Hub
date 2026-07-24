import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { texasEsbdProvider } from "./texasEsbd";
import { nyScrProvider } from "./nyScr";
import { bsoPortalProviders } from "./bsoPortal";
import { bonfireTenantProvider } from "./bonfirePortal";
import { civicEngageTenantProvider } from "./civicEngageBids";
import { ionWaveTenantProvider } from "./ionWavePortal";
import { jaggaerSciQuestTenantProvider } from "./jaggaerSciQuest";
import { openGovTenantProvider } from "./openGov";
import { CAL_EPROCURE_SOURCE, calEprocureProvider } from "./calEprocure";
import { deepRecoveryProviders } from "./deepRecoveryProviders";
import {
  STATEWIDE_PORTAL_CONFIGS,
  StatewideProcurementProvider,
} from "./statewideProcurementPortals";
import { publicPortalProvidersProvider as legacyPublicPortalInventory } from "./publicPortalProviders";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import {
  failedPortalStatus,
  loadPublicPortalHealth,
  savePublicPortalHealth,
  selectFairPortalSources,
  type PublicPortalSourceRunStatus,
} from "./publicPortalProviders/portalHealthStore";
import { runCrawlerForSource } from "../crawler";
import { composeAbortSignal } from "./abortSignals";
import {
  partitionProviderRecordsForQuery,
  type ProviderQueryPartition,
} from "./providerQueryMatch";
import { fairMergeOpportunityGroups } from "./fairOpportunityMerge";

const SOURCE_TIMEOUT_MS = 20_000;
const ROTATION_BATCH_SIZE = 20;
const SOURCE_SCAN_LIMIT = 200;
const RESULT_LIMIT = 100;
const SOURCE_CONCURRENCY = 4;
const QUERY_REJECTION_SAMPLE_LIMIT = 2;
const CRAWLER_SCRAPER_TYPES = new Set([
  "static_html",
  "pdf_links",
  "rss",
  "public_json",
]);

const statewideProviders = new Map<string, DataSourceProvider>(
  STATEWIDE_PORTAL_CONFIGS.map((config) => [
    config.portalId,
    new StatewideProcurementProvider(config),
  ]),
);

function providerForSource(sourceId: string): DataSourceProvider | undefined {
  if (sourceId === "tx-esbd") return texasEsbdProvider;
  if (sourceId === "ny-contract-reporter") return nyScrProvider;
  if (sourceId === CAL_EPROCURE_SOURCE.id) return calEprocureProvider;
  return (
    deepRecoveryProviders[sourceId] ??
    bsoPortalProviders[sourceId] ??
    jaggaerSciQuestTenantProvider(sourceId) ??
    bonfireTenantProvider(sourceId) ??
    ionWaveTenantProvider(sourceId) ??
    civicEngageTenantProvider(sourceId) ??
    openGovTenantProvider(sourceId) ??
    statewideProviders.get(sourceId)
  );
}

function isRunnableSource(source: PublicPortalSource): boolean {
  return Boolean(providerForSource(source.id)) || CRAWLER_SCRAPER_TYPES.has(source.scraperType);
}

function normalizeSourceRecord(
  record: NormalizedOpportunity,
  source: PublicPortalSource,
): NormalizedOpportunity {
  const tags = Array.isArray(record.rawData?.tags)
    ? record.rawData.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  return {
    ...record,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      ...(record.rawData ?? {}),
      sourceId: source.id,
      agencyName: source.agencyName,
      portalPlatform: source.portalPlatform,
      sourceConfidence:
        record.rawData?.sourceConfidence === "low" ||
        record.rawData?.sourceConfidence === "medium" ||
        record.rawData?.sourceConfidence === "high"
          ? record.rawData.sourceConfidence
          : source.scraperType === "existing_parser"
            ? "high"
            : "medium",
      tags: Array.from(
        new Set([
          ...tags,
          "official-procurement-portal",
          `portal:${source.id}`,
        ]),
      ),
    },
  };
}

function successfulYieldStatus(
  source: PublicPortalSource,
  prior: PublicPortalSourceRunStatus | undefined,
  checkedAt: Date,
  rawCount: number,
  matchedCount: number,
): PublicPortalSourceRunStatus {
  const yieldedRelevantRecord = matchedCount > 0;
  return {
    sourceId: source.id,
    sourceName: source.agencyName,
    domain: source.domain,
    lastCheckedAt: checkedAt,
    lastSuccessAt: checkedAt,
    lastFailureAt: prior?.lastFailureAt,
    lastFailureReason: prior?.lastFailureReason,
    resultCount: rawCount,
    matchedCount,
    lifetimeResultCount: (prior?.lifetimeResultCount ?? 0) + rawCount,
    totalAttempts: (prior?.totalAttempts ?? 0) + 1,
    totalSuccesses: (prior?.totalSuccesses ?? 0) + 1,
    totalFailures: prior?.totalFailures ?? 0,
    consecutiveFailures: 0,
    consecutiveNoResultSuccesses: yieldedRelevantRecord
      ? 0
      : (prior?.consecutiveNoResultSuccesses ?? 0) + 1,
    lastOutcome: yieldedRelevantRecord ? "success" : "no_results",
  };
}

interface SourceCollection {
  source: PublicPortalSource;
  partition: ProviderQueryPartition;
  records: NormalizedOpportunity[];
  errors: string[];
}

async function collectRawSourceRecords(
  source: PublicPortalSource,
  options: FetchOptions,
  signal: AbortSignal,
): Promise<ProviderFetchResult> {
  const provider = providerForSource(source.id);
  if (provider) {
    // Adapter-specific OR-word matchers are intentionally bypassed. The shared
    // query classifier runs after normalization and before any global cap.
    return provider.fetch({
      ...options,
      keywords: undefined,
      offset: 0,
      limit: SOURCE_SCAN_LIMIT,
      signal,
    });
  }

  if (!CRAWLER_SCRAPER_TYPES.has(source.scraperType)) {
    return {
      records: [],
      total: 0,
      errors: [
        `${source.id}: no source-specific adapter or approved public-page crawler is registered`,
      ],
    };
  }

  // This is invoked only by the explicit Fetch Intelligence action. force=true
  // prevents persisted crawler cadence from silently skipping a manual run.
  const result = await runCrawlerForSource(source, {
    force: true,
    signal,
  });
  if (!result) {
    return {
      records: [],
      total: 0,
      errors: [`${source.id}: no crawler configuration is available`],
    };
  }
  return {
    records: result.records,
    total: result.records.length,
    errors: result.diagnostics.errors.map((error) => `${source.id}: ${error}`),
  };
}

async function collectSource(
  source: PublicPortalSource,
  prior: PublicPortalSourceRunStatus | undefined,
  options: FetchOptions,
): Promise<SourceCollection> {
  const checkedAt = new Date();
  const sourceSignal = composeAbortSignal(SOURCE_TIMEOUT_MS, options.signal);
  let rawResult: ProviderFetchResult;
  try {
    rawResult = await collectRawSourceRecords(
      source,
      options,
      sourceSignal.signal,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const status = failedPortalStatus(source, prior, new Date(), reason);
    await savePublicPortalHealth(status);
    sourceSignal.cleanup();
    return {
      source,
      partition: {
        matched: [],
        rejectedSamples: [],
        rawCount: 0,
        matchedCount: 0,
        rejectedCount: 0,
      },
      records: [],
      errors: [`${source.id}: ${reason}`],
    };
  } finally {
    sourceSignal.cleanup();
  }

  const normalized = rawResult.records.map((record) =>
    normalizeSourceRecord(record, source),
  );
  const partition = partitionProviderRecordsForQuery(
    normalized,
    options.keywords,
    QUERY_REJECTION_SAMPLE_LIMIT,
  );
  const errors = [...rawResult.errors];
  const failedWithoutAnyRows =
    partition.rawCount === 0 && rawResult.errors.length > 0;
  const status = failedWithoutAnyRows
    ? failedPortalStatus(
        source,
        prior,
        checkedAt,
        rawResult.errors.join("; "),
      )
    : successfulYieldStatus(
        source,
        prior,
        checkedAt,
        partition.rawCount,
        partition.matchedCount,
      );
  try {
    await savePublicPortalHealth(status);
  } catch (error) {
    errors.push(
      `${source.id}: portal health persistence failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return {
    source,
    partition,
    records: [...partition.matched, ...partition.rejectedSamples],
    errors,
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
      async () => {
        while (!signal?.aborted) {
          const index = cursor++;
          if (index >= items.length) return;
          const item = items[index];
          if (item === undefined) return;
          results[index] = await worker(item);
        }
      },
    ),
  );
  return results.filter((result): result is R => result !== undefined);
}

function uniqueInventory(): PublicPortalSource[] {
  const byId = new Map<string, PublicPortalSource>();
  for (const source of legacyPublicPortalInventory.getSources()) {
    byId.set(source.id, source);
  }
  return Array.from(byId.values());
}

export class AuditedPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private readonly inventory = uniqueInventory();
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  async isConfigured(): Promise<boolean> {
    return this.inventory.some(
      (source) =>
        source.enabled &&
        source.verificationStatus === "verified" &&
        isRunnableSource(source),
    );
  }

  getSources(): PublicPortalSource[] {
    return [...this.inventory];
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const statuses = await loadPublicPortalHealth().catch(
      () => new Map<string, PublicPortalSourceRunStatus>(),
    );
    const runnable = this.inventory.filter(
      (source) =>
        source.enabled &&
        source.verificationStatus === "verified" &&
        isRunnableSource(source),
    );
    const dedicatedIds = new Set(
      runnable
        .filter((source) => Boolean(providerForSource(source.id)))
        .map((source) => source.id),
    );
    const selection = selectFairPortalSources(
      runnable,
      statuses,
      ROTATION_BATCH_SIZE,
      dedicatedIds,
    );

    const collections = await mapWithConcurrency(
      selection.selected,
      SOURCE_CONCURRENCY,
      (source) => collectSource(source, statuses.get(source.id), options),
      options.signal,
    );
    const requestedLimit = Math.min(
      RESULT_LIMIT,
      Math.max(1, options.limit ?? RESULT_LIMIT),
    );
    const records = fairMergeOpportunityGroups(
      collections.map((collection) => ({
        sourceId: collection.source.id,
        records: collection.records,
      })),
      requestedLimit,
    );
    const errors = collections.flatMap((collection) => collection.errors);

    this.recordCount = records.length;
    this.lastError = errors.length ? errors.join("; ").slice(0, 2_000) : undefined;
    if (records.length > 0 || errors.length === 0) this.lastSuccess = new Date();

    return {
      records,
      total: collections.reduce(
        (sum, collection) => sum + collection.partition.matchedCount,
        0,
      ),
      errors,
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const statuses = Array.from(
      (await loadPublicPortalHealth().catch(
        () => new Map<string, PublicPortalSourceRunStatus>(),
      )).values(),
    );
    const failures = statuses.filter(
      (status) =>
        status.lastOutcome === "failed" ||
        status.lastOutcome === "validation_failed",
    );
    return {
      name: this.name,
      configured: await this.isConfigured(),
      healthy: failures.length === 0,
      errorMessage:
        this.lastError ??
        (failures.length
          ? `${failures.length} portal sources are currently failing`
          : undefined),
      recordCount: statuses.reduce(
        (sum, status) => sum + status.matchedCount,
        0,
      ),
      lastAttempt:
        this.lastAttempt ??
        statuses.reduce<Date | undefined>(
          (latest, status) =>
            !latest || status.lastCheckedAt > latest
              ? status.lastCheckedAt
              : latest,
          undefined,
        ),
      lastSuccess: this.lastSuccess,
    };
  }
}

export const auditedPublicPortalProvider = new AuditedPublicPortalProvider();
export { successfulYieldStatus };
