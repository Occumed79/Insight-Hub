import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "../types";
import {
  STATEWIDE_BATCH_2_PORTAL_IDS,
  STATEWIDE_BATCH_2_SOURCES,
  statewidePortalProviders,
} from "../statewidePortalsBatch2";
import {
  PublicPortalProvidersProvider as CorePublicPortalProvidersProvider,
  PUBLIC_PORTAL_SOURCES,
  isDedicatedPublicPortalSourceId as isCoreDedicatedSourceId,
  type PublicPortalSource,
  type PublicPortalSourceRunStatus,
} from "./core";
import {
  failedPortalStatus,
  loadPublicPortalHealth,
  savePublicPortalHealth,
  successfulPortalStatus,
} from "./portalHealthStore";

export * from "./core";

const BATCH_SOURCES: PublicPortalSource[] = STATEWIDE_BATCH_2_SOURCES.map((source) => {
  const existing = PUBLIC_PORTAL_SOURCES.find((candidate) => candidate.id === source.portalId);
  return {
    ...(existing ?? {
      id: source.portalId,
      agencyName: source.buyerName,
      agencyType: "state" as const,
      state: source.state,
      sourceUrl: source.listingUrl,
      searchUrl: source.listingUrl,
      domain: new URL(source.listingUrl).hostname,
      sourceLevel: "state" as const,
      level: "state" as const,
      accessMode: "public_html" as const,
      occumedServiceCategories: [],
    }),
    sourceUrl: source.listingUrl,
    searchUrl: source.listingUrl,
    domain: new URL(source.listingUrl).hostname,
    portalPlatform: source.sourceBadge,
    scraperType: "existing_parser" as const,
    enabled: true,
    verificationStatus: "verified" as const,
    notes: `Dedicated listing/detail adapter for ${source.sourceBadge}.`,
  };
});

const coreSources = PUBLIC_PORTAL_SOURCES.filter((source) => !STATEWIDE_BATCH_2_PORTAL_IDS.has(source.id));
const coreProvider = new CorePublicPortalProvidersProvider(coreSources);
const batchStatuses = new Map<string, PublicPortalSourceRunStatus>();

function recordKey(record: NormalizedOpportunity): string {
  const sourceId = typeof record.rawData?.sourceId === "string" ? record.rawData.sourceId : "";
  const solicitation = record.solicitationNumber?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (sourceId && solicitation) return `sol:${sourceId}:${solicitation}`;
  if (record.sourceUrl) return `url:${record.sourceUrl.toLowerCase()}`;
  return `id:${record.externalId.toLowerCase()}`;
}

async function hydrateBatchStatuses(): Promise<void> {
  const persisted = await loadPublicPortalHealth();
  for (const source of BATCH_SOURCES) {
    const status = persisted.get(source.id);
    if (status) batchStatuses.set(source.id, status);
  }
}

async function rememberBatchStatus(status: PublicPortalSourceRunStatus, errors: string[]): Promise<void> {
  batchStatuses.set(status.sourceId, status);
  try {
    await savePublicPortalHealth(status);
  } catch (error) {
    errors.push(`${status.sourceId}: portal health persistence failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function isDedicatedPublicPortalSourceId(sourceId: string): boolean {
  return STATEWIDE_BATCH_2_PORTAL_IDS.has(sourceId) || isCoreDedicatedSourceId(sourceId);
}

export class PublicPortalProvidersProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    return BATCH_SOURCES.length > 0 || coreProvider.isConfigured();
  }

  getSources(): PublicPortalSource[] {
    return [...coreProvider.getSources(), ...BATCH_SOURCES];
  }

  getSourceStatuses(): PublicPortalSourceRunStatus[] {
    const byId = new Map(coreProvider.getSourceStatuses().map((status) => [status.sourceId, status]));
    for (const status of batchStatuses.values()) byId.set(status.sourceId, status);
    return Array.from(byId.values()).sort((left, right) => right.lastCheckedAt.getTime() - left.lastCheckedAt.getTime());
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const errors: string[] = [];
    try {
      await hydrateBatchStatuses();
    } catch (error) {
      errors.push(`statewide-batch-health-load: ${error instanceof Error ? error.message : String(error)}`);
    }

    const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const offset = Math.max(options.offset ?? 0, 0);
    const perSourceLimit = Math.max(1, Math.ceil((offset + limit) / Math.max(BATCH_SOURCES.length, 1)));
    const batchRuns = BATCH_SOURCES.map(async (source): Promise<ProviderFetchResult> => {
      const provider = statewidePortalProviders[source.id];
      if (!provider) return { records: [], total: 0, errors: [`${source.id}: provider not registered`] };
      const prior = batchStatuses.get(source.id);
      const checkedAt = new Date();
      try {
        const result = await provider.fetch({ ...options, limit: perSourceLimit, offset: 0 });
        if (result.records.length === 0 && result.errors.length > 0) {
          await rememberBatchStatus(failedPortalStatus(source, prior, checkedAt, result.errors.join("; ")), result.errors);
        } else {
          await rememberBatchStatus(successfulPortalStatus(source, prior, new Date(), result.records.length, 0), result.errors);
        }
        return result;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const runErrors = [`${source.id}: ${reason}`];
        await rememberBatchStatus(failedPortalStatus(source, prior, checkedAt, reason), runErrors);
        return { records: [], total: 0, errors: runErrors };
      }
    });

    const settled = await Promise.allSettled([
      coreProvider.fetch({ ...options, limit }),
      ...batchRuns,
    ]);
    const candidates: NormalizedOpportunity[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        candidates.push(...result.value.records);
        errors.push(...result.value.errors);
      } else {
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }

    const seen = new Set<string>();
    const records = candidates.filter((record) => {
      const key = recordKey(record);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(offset, offset + limit);
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    try { await hydrateBatchStatuses(); } catch { /* use in-memory statuses */ }
    const core = await coreProvider.getStatus().catch(() => undefined);
    const statuses = Array.from(batchStatuses.values());
    const failures = statuses.filter((status) => status.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt));
    const attempts = statuses.map((status) => status.lastCheckedAt).concat(core?.lastAttempt ? [core.lastAttempt] : []);
    const successes = statuses.flatMap((status) => status.lastSuccessAt ? [status.lastSuccessAt] : []).concat(core?.lastSuccess ? [core.lastSuccess] : []);
    return {
      name: this.name,
      configured: true,
      healthy: failures.length === 0 && (core?.healthy ?? true),
      errorMessage: [
        core?.errorMessage,
        failures.length ? `${failures.length} statewide batch source${failures.length === 1 ? " is" : "s are"} currently failing` : undefined,
      ].filter(Boolean).join("; ") || undefined,
      recordCount: (core?.recordCount ?? 0) + statuses.reduce((sum, status) => sum + status.resultCount, 0),
      lastAttempt: attempts.length ? new Date(Math.max(...attempts.map((date) => date.getTime()))) : undefined,
      lastSuccess: successes.length ? new Date(Math.max(...successes.map((date) => date.getTime()))) : undefined,
    };
  }
}

export const publicPortalProvidersProvider = new PublicPortalProvidersProvider();
