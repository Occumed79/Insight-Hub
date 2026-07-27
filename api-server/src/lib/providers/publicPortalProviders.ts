import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { JAGGAER_SCIQUEST_TENANTS } from "./jaggaerSciQuest";
import { BONFIRE_TENANTS } from "./bonfirePortal";
import { IONWAVE_TENANTS } from "./ionWavePortal";
import { CAL_EPROCURE_SOURCE } from "./calEprocure";
import { DEEP_RECOVERY_SOURCES } from "./deepRecoveryProviders";
import {
  STATEWIDE_PROCUREMENT_SOURCES,
} from "./statewideProcurementPortals";
import {
  PublicPortalProvidersProvider,
  PUBLIC_PORTAL_SOURCES,
  type PublicPortalSourceRunStatus,
} from "./publicPortalProviders/index";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import { getRegisteredPublicPortalAdapter } from "./publicPortalAdapterRegistry";
import { composeAbortSignal } from "./abortSignals";
import {
  failedPortalStatus,
  loadPublicPortalHealth,
  savePublicPortalHealth,
  selectFairPortalSources,
  successfulPortalStatus,
} from "./publicPortalProviders/portalHealthStore";

export * from "./publicPortalProviders/index";
export * from "./bsoPortal";
export * from "./jaggaerSciQuest";
export * from "./bonfirePortal";
export * from "./ionWavePortal";
export * from "./calEprocure";
export * from "./deepRecoveryProviders";
export * from "./georgiaGawork";
export * from "./minnesotaOsp";
export * from "./oregonBuys";
export * from "./southDakotaPostingBoard";
export * from "./statewideProcurementPortals";

const BSO_SOURCES: PublicPortalSource[] = [
  {
    id: "ma-commbuys",
    agencyName: "Massachusetts COMMBUYS",
    agencyType: "state",
    state: "MA",
    sourceUrl:
      "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    searchUrl:
      "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    domain: "commbuys.com",
    portalPlatform: "Periscope S2G / BSO",
    sourceLevel: "state",
    level: "state",
    accessMode: "portal",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes:
      "Dedicated public listing/detail adapter for Massachusetts COMMBUYS.",
  },
  {
    id: "nv-epro",
    agencyName: "NEVADAePro",
    agencyType: "state",
    state: "NV",
    sourceUrl:
      "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    searchUrl:
      "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    domain: "nevadaepro.com",
    portalPlatform: "Periscope S2G / BSO",
    sourceLevel: "state",
    level: "state",
    accessMode: "portal",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Dedicated public listing/detail adapter for NEVADAePro.",
  },
  {
    id: "nj-start",
    agencyName: "New Jersey START",
    agencyType: "state",
    state: "NJ",
    sourceUrl:
      "https://www.njstart.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    searchUrl:
      "https://www.njstart.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    domain: "njstart.gov",
    portalPlatform: "Periscope S2G / BSO",
    sourceLevel: "state",
    level: "state",
    accessMode: "portal",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Dedicated public listing/detail adapter for New Jersey START.",
  },
];

const JAGGAER_SOURCES: PublicPortalSource[] = JAGGAER_SCIQUEST_TENANTS.filter(
  (tenant) => tenant.capability === "dedicated_listing",
).map((tenant) => ({
  id: tenant.portalId,
  agencyName: tenant.buyerName,
  agencyType: "state",
  state: tenant.state,
  sourceUrl: tenant.listingUrl,
  searchUrl: tenant.listingUrl,
  domain: new URL(tenant.listingUrl).hostname,
  portalPlatform: "Jaggaer / SciQuest",
  sourceLevel: "state",
  level: "state",
  accessMode: "portal",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated public Jaggaer/SciQuest event-listing adapter.",
}));

const BONFIRE_SOURCES: PublicPortalSource[] = BONFIRE_TENANTS.map((tenant) => ({
  id: tenant.portalId,
  agencyName: tenant.buyerName,
  agencyType: "county",
  state: tenant.state,
  sourceUrl: tenant.listingUrl,
  searchUrl: tenant.listingUrl,
  domain: new URL(tenant.listingUrl).hostname,
  portalPlatform: "Bonfire / Euna",
  sourceLevel: "county",
  accessMode: "portal",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated public Bonfire/Euna opportunity-listing adapter.",
}));

const IONWAVE_SOURCES: PublicPortalSource[] = IONWAVE_TENANTS.map((tenant) => ({
  id: tenant.portalId,
  agencyName: tenant.buyerName,
  agencyType: "county",
  state: tenant.state,
  sourceUrl: tenant.listingUrl,
  searchUrl: tenant.listingUrl,
  domain: new URL(tenant.listingUrl).hostname,
  portalPlatform: "IonWave / Euna",
  sourceLevel: "county",
  accessMode: "portal",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated public IonWave/Euna bid-listing adapter.",
}));

const CAL_EPROCURE_SOURCES: PublicPortalSource[] = [CAL_EPROCURE_SOURCE];
const DEEP_RECOVERY_SOURCE_IDS = new Set(
  DEEP_RECOVERY_SOURCES.map((source) => source.id),
);
const STATEWIDE_SHARED_SOURCES = STATEWIDE_PROCUREMENT_SOURCES.filter(
  (source) => !DEEP_RECOVERY_SOURCE_IDS.has(source.id),
);
const STATEWIDE_SOURCE_IDS = new Set(
  STATEWIDE_PROCUREMENT_SOURCES.map((source) => source.id),
);

const COMBINED_PORTAL_SOURCE_TIMEOUT_MS = 30_000;
const COMBINED_PORTAL_RUN_TIMEOUT_MS = 75_000;
const DEFAULT_DEDICATED_ROTATION_BATCH_SIZE = 12;
const DEFAULT_DEDICATED_CONCURRENCY = 4;

const catalogPortalProvider = new PublicPortalProvidersProvider(
  PUBLIC_PORTAL_SOURCES.filter(
    (source) => !STATEWIDE_SOURCE_IDS.has(source.id),
  ),
);
const catalogSourceIds = new Set(
  catalogPortalProvider.getSources().map((source) => source.id),
);

interface DedicatedGroup {
  sources: PublicPortalSource[];
  providers: Record<string, DataSourceProvider>;
  statuses: Map<string, PublicPortalSourceRunStatus>;
}

function runtimeAuthorizedGroup(sources: PublicPortalSource[]): DedicatedGroup {
  const providers: Record<string, DataSourceProvider> = {};
  const authorizedSources = sources.filter((source) => {
    const provider = getRegisteredPublicPortalAdapter(source.id);
    if (!provider) return false;
    providers[source.id] = provider;
    return true;
  });
  return {
    sources: authorizedSources,
    providers,
    statuses: new Map(),
  };
}

const ALL_DEDICATED_GROUPS: DedicatedGroup[] = [
  BSO_SOURCES,
  JAGGAER_SOURCES,
  BONFIRE_SOURCES,
  IONWAVE_SOURCES,
  CAL_EPROCURE_SOURCES,
  DEEP_RECOVERY_SOURCES,
  STATEWIDE_SHARED_SOURCES,
]
  .map(runtimeAuthorizedGroup)
  .filter((group) => group.sources.length > 0);

// Shared BSO/Jaggaer/Bonfire/IonWave adapters are registered inside the
// catalog provider. Do not execute the same portal ID a second time here.
const dedicatedGroups: DedicatedGroup[] = ALL_DEDICATED_GROUPS.map((group) => ({
  ...group,
  sources: group.sources.filter((source) => !catalogSourceIds.has(source.id)),
})).filter((group) => group.sources.length > 0);

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

async function hydrateDedicatedStatuses(): Promise<void> {
  const persisted = await loadPublicPortalHealth();
  for (const group of dedicatedGroups) {
    for (const source of group.sources) {
      const status = persisted.get(source.id);
      if (status) group.statuses.set(source.id, status);
    }
  }
}

async function saveDedicatedStatus(
  status: PublicPortalSourceRunStatus,
  target: Map<string, PublicPortalSourceRunStatus>,
  errors: string[],
): Promise<void> {
  target.set(status.sourceId, status);
  try {
    await savePublicPortalHealth(status);
  } catch (error) {
    errors.push(
      `${status.sourceId}: portal health persistence failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function recordKey(record: NormalizedOpportunity): string {
  const sourceId =
    typeof record.rawData?.sourceId === "string" ? record.rawData.sourceId : "";
  const solicitation = record.solicitationNumber
    ?.replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (sourceId && solicitation) return `sol:${sourceId}:${solicitation}`;
  if (record.sourceUrl) {
    try {
      const url = new URL(record.sourceUrl);
      url.hash = "";
      return `url:${url.toString().toLowerCase()}`;
    } catch {
      return `url:${record.sourceUrl.toLowerCase()}`;
    }
  }
  return `id:${record.externalId.toLowerCase()}`;
}

function mergedSources(): PublicPortalSource[] {
  const byId = new Map(
    catalogPortalProvider.getSources().map((source) => [source.id, source]),
  );
  for (const group of ALL_DEDICATED_GROUPS) {
    for (const source of group.sources) byId.set(source.id, source);
  }
  return Array.from(byId.values());
}

async function runDedicatedSource(
  source: PublicPortalSource,
  provider: DataSourceProvider | undefined,
  statuses: Map<string, PublicPortalSourceRunStatus>,
  options: FetchOptions,
  limit: number,
  timeoutMs = COMBINED_PORTAL_SOURCE_TIMEOUT_MS,
): Promise<ProviderFetchResult> {
  if (!provider) {
    return {
      records: [],
      total: 0,
      errors: [`${source.id}: dedicated provider is not registered`],
    };
  }
  const prior = statuses.get(source.id);
  const checkedAt = new Date();
  try {
    const sourceSignal = composeAbortSignal(timeoutMs, options.signal);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const sourceDeadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        const error = new Error(`${source.id} timed out after ${timeoutMs}ms`);
        sourceSignal.cleanup();
        reject(error);
      }, timeoutMs + 250);
    });
    const sourcePromise = provider.fetch({
      ...options,
      limit,
      signal: sourceSignal.signal,
    });
    sourcePromise.catch(() => undefined);
    let result: ProviderFetchResult;
    try {
      result = await Promise.race([sourcePromise, sourceDeadline]);
    } catch (error) {
      if (sourceSignal.signal.aborted) {
        const reason = sourceSignal.signal.reason;
        if (reason instanceof DOMException && reason.name === "TimeoutError") {
          throw new Error(`${source.id} timed out after ${timeoutMs}ms`);
        }
        if (reason instanceof Error) throw reason;
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      sourceSignal.cleanup();
    }
    const status =
      result.records.length === 0 && result.errors.length > 0
        ? failedPortalStatus(
            source,
            prior,
            checkedAt,
            result.errors.join("; "),
          )
        : successfulPortalStatus(
            source,
            prior,
            new Date(),
            result.records.length,
            0,
          );
    await saveDedicatedStatus(status, statuses, result.errors);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const errors = [`${source.id}: ${reason}`];
    await saveDedicatedStatus(
      failedPortalStatus(source, prior, checkedAt, reason),
      statuses,
      errors,
    );
    return { records: [], total: 0, errors };
  }
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(
    Math.max(1, concurrency),
    Math.max(1, items.length),
  );
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        if (signal?.aborted) return;
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        const item = items[index];
        if (item === undefined) return;
        await worker(item);
      }
    }),
  );
}

class CombinedPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    return (
      (await catalogPortalProvider.isConfigured().catch(() => false)) ||
      dedicatedGroups.some((group) =>
        group.sources.some((source) => Boolean(group.providers[source.id])),
      )
    );
  }

  getSources(): PublicPortalSource[] {
    return mergedSources();
  }

  getSourceStatuses(): PublicPortalSourceRunStatus[] {
    const byId = new Map(
      catalogPortalProvider
        .getSourceStatuses()
        .map((status) => [status.sourceId, status]),
    );
    for (const group of dedicatedGroups) {
      for (const status of group.statuses.values()) {
        byId.set(status.sourceId, status);
      }
    }
    return Array.from(byId.values()).sort(
      (left, right) =>
        right.lastCheckedAt.getTime() - left.lastCheckedAt.getTime(),
    );
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const requestedLimit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const offset = Math.max(options.offset ?? 0, 0);
    const target = Math.min(300, offset + requestedLimit);
    const sourceOptions: FetchOptions = { ...options, limit: target, offset: 0 };
    const errors: string[] = [];
    const candidates: NormalizedOpportunity[] = [];

    try {
      await hydrateDedicatedStatuses();
    } catch (error) {
      errors.push(
        `dedicated-portal-health-load: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const sourceEntries = dedicatedGroups.flatMap((group) =>
      group.sources.map((source) => ({
        source,
        provider: group.providers[source.id],
        statuses: group.statuses,
      })),
    );
    const statusMap = new Map<string, PublicPortalSourceRunStatus>();
    for (const group of dedicatedGroups) {
      for (const [sourceId, status] of group.statuses) {
        statusMap.set(sourceId, status);
      }
    }
    const dedicatedBatchSize = positiveIntegerEnv(
      "PUBLIC_PORTAL_DEDICATED_ROTATION_BATCH_SIZE",
      DEFAULT_DEDICATED_ROTATION_BATCH_SIZE,
      1,
      50,
    );
    const dedicatedConcurrency = positiveIntegerEnv(
      "PUBLIC_PORTAL_DEDICATED_CONCURRENCY",
      DEFAULT_DEDICATED_CONCURRENCY,
      1,
      8,
    );
    const dedicatedIds = new Set(
      sourceEntries.map((entry) => entry.source.id),
    );
    const selectedIds = new Set(
      selectFairPortalSources(
        sourceEntries.map((entry) => entry.source),
        statusMap,
        dedicatedBatchSize,
        dedicatedIds,
      ).selected.map((source) => source.id),
    );
    const selectedEntries = sourceEntries.filter((entry) =>
      selectedIds.has(entry.source.id),
    );

    const runSignal = composeAbortSignal(
      COMBINED_PORTAL_RUN_TIMEOUT_MS,
      options.signal,
    );
    let runTimeout: ReturnType<typeof setTimeout> | undefined;

    const catalogTask = (async () => {
      const result = await catalogPortalProvider.fetch({
        ...sourceOptions,
        signal: runSignal.signal,
      });
      candidates.push(...result.records);
      errors.push(...result.errors);
    })();

    const dedicatedTask = runWithConcurrency(
      selectedEntries,
      dedicatedConcurrency,
      async (entry) => {
        const result = await runDedicatedSource(
          entry.source,
          entry.provider,
          entry.statuses,
          { ...sourceOptions, signal: runSignal.signal },
          target,
        );
        candidates.push(...result.records);
        errors.push(...result.errors);
      },
      runSignal.signal,
    );

    const allTasks = Promise.allSettled([catalogTask, dedicatedTask]);
    const runDeadline = new Promise<void>((resolve) => {
      runTimeout = setTimeout(() => {
        errors.push(
          `publicPortalProviders: combined run deadline reached after ${COMBINED_PORTAL_RUN_TIMEOUT_MS}ms; completed portal results were retained`,
        );
        runSignal.cleanup();
        resolve();
      }, COMBINED_PORTAL_RUN_TIMEOUT_MS + 500);
    });

    allTasks.catch(() => undefined);
    await Promise.race([allTasks.then(() => undefined), runDeadline]);
    if (runTimeout) clearTimeout(runTimeout);
    runSignal.cleanup();

    const seen = new Set<string>();
    const deduped = candidates.filter((record) => {
      const key = recordKey(record);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const records = deduped.slice(offset, offset + requestedLimit);
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      await hydrateDedicatedStatuses();
    } catch {
      // Retain in-memory health if durable status is temporarily unavailable.
    }
    const base = await catalogPortalProvider.getStatus().catch(() => undefined);
    const statuses = dedicatedGroups.flatMap((group) =>
      Array.from(group.statuses.values()),
    );
    const failures = statuses.filter(
      (status) =>
        status.lastFailureAt &&
        (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt),
    );
    const dates = statuses
      .map((status) => status.lastCheckedAt)
      .concat(base?.lastAttempt ? [base.lastAttempt] : []);
    const successes = statuses
      .flatMap((status) => (status.lastSuccessAt ? [status.lastSuccessAt] : []))
      .concat(base?.lastSuccess ? [base.lastSuccess] : []);
    return {
      name: this.name,
      configured:
        Boolean(base?.configured) ||
        dedicatedGroups.some((group) => group.sources.length > 0),
      healthy: failures.length === 0 && (base?.healthy ?? true),
      errorMessage:
        [
          base?.errorMessage,
          failures.length
            ? `${failures.length} dedicated portal${
                failures.length === 1 ? " is" : "s are"
              } currently failing`
            : undefined,
        ]
          .filter(Boolean)
          .join("; ") || undefined,
      recordCount:
        (base?.recordCount ?? 0) +
        statuses.reduce((sum, status) => sum + status.resultCount, 0),
      lastAttempt: dates.length
        ? new Date(Math.max(...dates.map((date) => date.getTime())))
        : undefined,
      lastSuccess: successes.length
        ? new Date(Math.max(...successes.map((date) => date.getTime())))
        : undefined,
    };
  }
}

export const publicPortalProvidersProvider = new CombinedPublicPortalProvider();
