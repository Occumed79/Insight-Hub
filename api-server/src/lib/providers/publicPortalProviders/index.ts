import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "../types";
import {
  CIVICENGAGE_PORTAL_IDS,
  CIVICENGAGE_TENANTS,
  civicEngageBidsProviders,
} from "../civicEngageBids";
import {
  PUBLIC_PORTAL_SOURCES,
  type PublicPortalSource,
} from "./catalog";
import {
  PublicPortalProvidersProvider as CorePublicPortalProvidersProvider,
} from "./indexCore";
import {
  failedPortalStatus,
  loadPublicPortalHealth,
  savePublicPortalHealth,
  selectFairPortalSources,
  successfulPortalStatus,
  type PublicPortalSourceRunStatus,
} from "./portalHealthStore";

export type { PublicPortalSourceRunStatus } from "./portalHealthStore";
export * from "../civicEngageBids";
export * from "./catalog";
export * from "./genericExtractors";

const DEFAULT_LIMIT = 100;
const DEFAULT_ROTATION_BATCH_SIZE = 10;
const DEFAULT_CONCURRENCY = 3;
const civicStatuses = new Map<string, PublicPortalSourceRunStatus>();

const BASE_PUBLIC_PORTAL_SOURCES = PUBLIC_PORTAL_SOURCES.filter(
  (source) => !CIVICENGAGE_PORTAL_IDS.has(source.id),
);

const coreProvider = new CorePublicPortalProvidersProvider(BASE_PUBLIC_PORTAL_SOURCES);

export const CIVICENGAGE_PUBLIC_PORTAL_SOURCES: PublicPortalSource[] = CIVICENGAGE_TENANTS.map(
  (tenant) => ({
    id: tenant.portalId,
    agencyName: tenant.buyerName,
    agencyType: "county",
    state: tenant.state,
    sourceUrl: tenant.listingUrl,
    searchUrl: tenant.listingUrl,
    domain: new URL(tenant.listingUrl).hostname.replace(/^www\./, ""),
    portalPlatform: "CivicEngage Bids.aspx",
    sourceLevel: "county",
    level: "district",
    accessMode: "public_html",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Dedicated public CivicEngage Bids.aspx listing/detail adapter.",
  }),
);

const CIVIC_SOURCE_BY_ID = new Map(
  CIVICENGAGE_PUBLIC_PORTAL_SOURCES.map((source) => [source.id, source]),
);

export const CIVICENGAGE_GENERIC_EXCLUDED_IDS = new Set(CIVICENGAGE_PORTAL_IDS);

function positiveIntegerEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function sourceIdForRecord(record: NormalizedOpportunity): string | undefined {
  const sourceId = record.rawData?.sourceId ?? record.rawData?.parsedPortalSourceId;
  return typeof sourceId === "string" && sourceId.trim() ? sourceId : undefined;
}

function recordKey(record: NormalizedOpportunity): string {
  if (record.externalId) return `id:${record.externalId.toLowerCase()}`;
  if (record.sourceUrl) {
    try {
      const url = new URL(record.sourceUrl);
      url.hash = "";
      return `url:${url.toString().toLowerCase()}`;
    } catch {
      return `url:${record.sourceUrl.toLowerCase()}`;
    }
  }
  return `title:${record.agency.toLowerCase()}:${record.title.toLowerCase()}`;
}

async function hydrateCivicStatuses(): Promise<void> {
  const persisted = await loadPublicPortalHealth();
  for (const source of CIVICENGAGE_PUBLIC_PORTAL_SOURCES) {
    const status = persisted.get(source.id);
    if (status) civicStatuses.set(source.id, status);
  }
}

async function rememberCivicStatus(
  status: PublicPortalSourceRunStatus,
  errors: string[],
): Promise<void> {
  civicStatuses.set(status.sourceId, status);
  try {
    await savePublicPortalHealth(status);
  } catch (error) {
    errors.push(
      `${status.sourceId}: portal health persistence failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        await worker(items[index] as T);
      }
    },
  );
  await Promise.all(workers);
}

function mergedSources(): PublicPortalSource[] {
  const byId = new Map(coreProvider.getSources().map((source) => [source.id, source]));
  for (const source of CIVICENGAGE_PUBLIC_PORTAL_SOURCES) byId.set(source.id, source);
  return Array.from(byId.values());
}

export class PublicPortalProvidersProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    return (await coreProvider.isConfigured().catch(() => false))
      || CIVICENGAGE_PUBLIC_PORTAL_SOURCES.some(
        (source) => Boolean(civicEngageBidsProviders[source.id]),
      );
  }

  getSources(): PublicPortalSource[] {
    return mergedSources();
  }

  getSourceStatuses(): PublicPortalSourceRunStatus[] {
    const byId = new Map(
      coreProvider.getSourceStatuses().map((status) => [status.sourceId, status]),
    );
    for (const status of civicStatuses.values()) byId.set(status.sourceId, status);
    return Array.from(byId.values()).sort(
      (left, right) => right.lastCheckedAt.getTime() - left.lastCheckedAt.getTime(),
    );
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const errors: string[] = [];
    try {
      await hydrateCivicStatuses();
    } catch (error) {
      errors.push(`civicengage-portal-health-load: ${error instanceof Error ? error.message : String(error)}`);
    }

    const requestedLimit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), DEFAULT_LIMIT);
    const offset = Math.max(options.offset ?? 0, 0);
    const targetCount = Math.min(DEFAULT_LIMIT, requestedLimit + offset);
    const rotationBatchSize = positiveIntegerEnv(
      "CIVICENGAGE_ROTATION_BATCH_SIZE",
      DEFAULT_ROTATION_BATCH_SIZE,
      1,
      CIVICENGAGE_PUBLIC_PORTAL_SOURCES.length,
    );
    const concurrency = positiveIntegerEnv(
      "CIVICENGAGE_SOURCE_CONCURRENCY",
      DEFAULT_CONCURRENCY,
      1,
      6,
    );
    const { selected: selectedCivicSources } = selectFairPortalSources(
      CIVICENGAGE_PUBLIC_PORTAL_SOURCES,
      civicStatuses,
      rotationBatchSize,
      new Set<string>(),
    );

    const corePromise = coreProvider.fetch({ ...options, offset: 0, limit: targetCount });
    const civicRecords: NormalizedOpportunity[] = [];

    await runWithConcurrency(selectedCivicSources, concurrency, async (source) => {
      const prior = civicStatuses.get(source.id);
      const checkedAt = new Date();
      const provider = civicEngageBidsProviders[source.id];
      if (!provider) {
        const reason = "dedicated CivicEngage provider is not registered";
        errors.push(`${source.id}: ${reason}`);
        await rememberCivicStatus(
          failedPortalStatus(source, prior, checkedAt, reason, "validation_failed"),
          errors,
        );
        return;
      }

      try {
        const result = await provider.fetch({ ...options, offset: 0, limit: targetCount });
        civicRecords.push(...result.records);
        errors.push(...result.errors);
        if (result.records.length === 0 && result.errors.length > 0) {
          await rememberCivicStatus(
            failedPortalStatus(source, prior, checkedAt, result.errors.join("; ")),
            errors,
          );
        } else {
          await rememberCivicStatus(
            successfulPortalStatus(source, prior, new Date(), result.records.length, 0),
            errors,
          );
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${source.id}: ${reason}`);
        await rememberCivicStatus(
          failedPortalStatus(source, prior, checkedAt, reason),
          errors,
        );
      }
    });

    const coreResult = await corePromise;
    errors.push(...coreResult.errors);
    const nonCivicCoreRecords = coreResult.records.filter((record) => {
      const sourceId = sourceIdForRecord(record);
      return !sourceId || !CIVICENGAGE_PORTAL_IDS.has(sourceId);
    });

    const seen = new Set<string>();
    const records = [...civicRecords, ...nonCivicCoreRecords].filter((record) => {
      const key = recordKey(record);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(offset, offset + requestedLimit);

    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      await hydrateCivicStatuses();
    } catch {
      // Retain in-process health when durable status storage is unavailable.
    }
    const core = await coreProvider.getStatus().catch(() => undefined);
    const civic = Array.from(civicStatuses.values());
    const failures = civic.filter(
      (status) => status.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt),
    );
    const attempts = civic.map((status) => status.lastCheckedAt)
      .concat(core?.lastAttempt ? [core.lastAttempt] : []);
    const successes = civic.flatMap((status) => status.lastSuccessAt ? [status.lastSuccessAt] : [])
      .concat(core?.lastSuccess ? [core.lastSuccess] : []);
    const configured = await this.isConfigured();

    return {
      name: this.name,
      configured,
      healthy: configured && failures.length === 0 && (core?.healthy ?? true),
      errorMessage: [
        core?.errorMessage,
        failures.length
          ? `${failures.length} CivicEngage portal${failures.length === 1 ? " is" : "s are"} currently failing`
          : undefined,
      ].filter(Boolean).join("; ") || undefined,
      recordCount: (core?.recordCount ?? 0) + civic.reduce((sum, status) => sum + status.resultCount, 0),
      lastAttempt: attempts.length
        ? new Date(Math.max(...attempts.map((date) => date.getTime())))
        : undefined,
      lastSuccess: successes.length
        ? new Date(Math.max(...successes.map((date) => date.getTime())))
        : undefined,
    };
  }
}

export const publicPortalProvidersProvider = new PublicPortalProvidersProvider();
