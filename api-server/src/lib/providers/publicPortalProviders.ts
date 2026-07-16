import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { bsoPortalProviders } from "./bsoPortal";
import {
  publicPortalProvidersProvider as catalogPortalProvider,
  type PublicPortalSourceRunStatus,
} from "./publicPortalProviders/index";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import {
  failedPortalStatus,
  loadPublicPortalHealth,
  savePublicPortalHealth,
  successfulPortalStatus,
} from "./publicPortalProviders/portalHealthStore";

export * from "./publicPortalProviders/index";
export * from "./bsoPortal";

const BSO_SOURCES: PublicPortalSource[] = [
  {
    id: "ma-commbuys",
    agencyName: "Massachusetts COMMBUYS",
    agencyType: "state",
    state: "MA",
    sourceUrl: "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    searchUrl: "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    domain: "commbuys.com",
    portalPlatform: "Periscope S2G / BSO",
    sourceLevel: "state",
    level: "state",
    accessMode: "portal",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Dedicated public listing/detail adapter for Massachusetts COMMBUYS.",
  },
  {
    id: "nv-epro",
    agencyName: "NEVADAePro",
    agencyType: "state",
    state: "NV",
    sourceUrl: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    searchUrl: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
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
    sourceUrl: "https://www.njstart.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    searchUrl: "https://www.njstart.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
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

const bsoStatuses = new Map<string, PublicPortalSourceRunStatus>();

async function hydrateBsoStatuses(): Promise<void> {
  const persisted = await loadPublicPortalHealth();
  for (const source of BSO_SOURCES) {
    const status = persisted.get(source.id);
    if (status) bsoStatuses.set(source.id, status);
  }
}

async function saveBsoStatus(status: PublicPortalSourceRunStatus, errors: string[]): Promise<void> {
  bsoStatuses.set(status.sourceId, status);
  try {
    await savePublicPortalHealth(status);
  } catch (error) {
    errors.push(`${status.sourceId}: portal health persistence failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function recordKey(record: NormalizedOpportunity): string {
  const sourceId = typeof record.rawData?.sourceId === "string" ? record.rawData.sourceId : "";
  const solicitation = record.solicitationNumber?.replace(/[^a-z0-9]/gi, "").toLowerCase();
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
  const byId = new Map(catalogPortalProvider.getSources().map((source) => [source.id, source]));
  for (const source of BSO_SOURCES) byId.set(source.id, source);
  return Array.from(byId.values());
}

async function runBsoSource(source: PublicPortalSource, options: FetchOptions, limit: number): Promise<ProviderFetchResult> {
  const provider = bsoPortalProviders[source.id];
  if (!provider) return { records: [], total: 0, errors: [`${source.id}: dedicated BSO provider is not registered`] };
  const prior = bsoStatuses.get(source.id);
  const checkedAt = new Date();
  try {
    const result = await provider.fetch({ ...options, limit });
    if (result.records.length === 0 && result.errors.length > 0) {
      await saveBsoStatus(failedPortalStatus(source, prior, checkedAt, result.errors.join("; ")), result.errors);
    } else {
      await saveBsoStatus(successfulPortalStatus(source, prior, new Date(), result.records.length, 0), result.errors);
    }
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const errors = [`${source.id}: ${reason}`];
    await saveBsoStatus(failedPortalStatus(source, prior, checkedAt, reason), errors);
    return { records: [], total: 0, errors };
  }
}

class CombinedPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    return (await catalogPortalProvider.isConfigured().catch(() => false)) || BSO_SOURCES.some((source) => Boolean(bsoPortalProviders[source.id]));
  }

  getSources(): PublicPortalSource[] {
    return mergedSources();
  }

  getSourceStatuses(): PublicPortalSourceRunStatus[] {
    const byId = new Map(catalogPortalProvider.getSourceStatuses().map((status) => [status.sourceId, status]));
    for (const status of bsoStatuses.values()) byId.set(status.sourceId, status);
    return Array.from(byId.values()).sort((left, right) => right.lastCheckedAt.getTime() - left.lastCheckedAt.getTime());
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const perBsoSource = Math.max(1, Math.ceil(limit / BSO_SOURCES.length));
    const errors: string[] = [];
    try {
      await hydrateBsoStatuses();
    } catch (error) {
      errors.push(`bso-health-load: ${error instanceof Error ? error.message : String(error)}`);
    }

    const settled = await Promise.allSettled([
      ...BSO_SOURCES.map((source) => runBsoSource(source, options, perBsoSource)),
      catalogPortalProvider.fetch({ ...options, limit }),
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
    }).slice(0, limit);
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    try { await hydrateBsoStatuses(); } catch { /* retain in-memory health */ }
    const base = await catalogPortalProvider.getStatus().catch(() => undefined);
    const statuses = Array.from(bsoStatuses.values());
    const failures = statuses.filter((status) => status.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt));
    const dates = statuses.map((status) => status.lastCheckedAt).concat(base?.lastAttempt ? [base.lastAttempt] : []);
    const successes = statuses.flatMap((status) => status.lastSuccessAt ? [status.lastSuccessAt] : []).concat(base?.lastSuccess ? [base.lastSuccess] : []);
    return {
      name: this.name,
      configured: Boolean(base?.configured) || BSO_SOURCES.length > 0,
      healthy: failures.length === 0 && (base?.healthy ?? true),
      errorMessage: [base?.errorMessage, failures.length ? `${failures.length} BSO-family portal${failures.length === 1 ? " is" : "s are"} currently failing` : undefined].filter(Boolean).join("; ") || undefined,
      recordCount: (base?.recordCount ?? 0) + statuses.reduce((sum, status) => sum + status.resultCount, 0),
      lastAttempt: dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined,
      lastSuccess: successes.length ? new Date(Math.max(...successes.map((date) => date.getTime()))) : undefined,
    };
  }
}

export const publicPortalProvidersProvider = new CombinedPublicPortalProvider();
