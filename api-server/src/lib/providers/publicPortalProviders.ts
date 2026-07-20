import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { bsoPortalProviders } from "./bsoPortal";
import { JAGGAER_SCIQUEST_TENANTS, jaggaerSciQuestProviders } from "./jaggaerSciQuest";
import { BONFIRE_TENANTS, bonfirePortalProviders } from "./bonfirePortal";
import { IONWAVE_TENANTS, ionWavePortalProviders } from "./ionWavePortal";
import { CAL_EPROCURE_SOURCE, calEprocureProvider } from "./calEprocure";
import { GEORGIA_GAWORK_SOURCE, georgiaGaworkProvider } from "./georgiaGawork";
import { MINNESOTA_OSP_SOURCE, minnesotaOspProvider } from "./minnesotaOsp";
import { OREGON_BUYS_SOURCE, oregonBuysProvider } from "./oregonBuys";
import { STATEWIDE_PROCUREMENT_SOURCES, statewideProcurementProviders } from "./statewideProcurementPortals";
import { PublicPortalProvidersProvider, PUBLIC_PORTAL_SOURCES, type PublicPortalSourceRunStatus } from "./publicPortalProviders/index";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import { failedPortalStatus, loadPublicPortalHealth, savePublicPortalHealth, successfulPortalStatus } from "./publicPortalProviders/portalHealthStore";

export * from "./publicPortalProviders/index";
export * from "./bsoPortal";
export * from "./jaggaerSciQuest";
export * from "./bonfirePortal";
export * from "./ionWavePortal";
export * from "./calEprocure";
export * from "./georgiaGawork";
export * from "./minnesotaOsp";
export * from "./oregonBuys";
export * from "./statewideProcurementPortals";

const BSO_SOURCES: PublicPortalSource[] = [
  { id: "ma-commbuys", agencyName: "Massachusetts COMMBUYS", agencyType: "state", state: "MA", sourceUrl: "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true", searchUrl: "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true", domain: "commbuys.com", portalPlatform: "Periscope S2G / BSO", sourceLevel: "state", level: "state", accessMode: "portal", scraperType: "existing_parser", enabled: true, verificationStatus: "verified", notes: "Dedicated public listing/detail adapter for Massachusetts COMMBUYS." },
  { id: "nv-epro", agencyName: "NEVADAePro", agencyType: "state", state: "NV", sourceUrl: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true", searchUrl: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true", domain: "nevadaepro.com", portalPlatform: "Periscope S2G / BSO", sourceLevel: "state", level: "state", accessMode: "portal", scraperType: "existing_parser", enabled: true, verificationStatus: "verified", notes: "Dedicated public listing/detail adapter for NEVADAePro." },
  { id: "nj-start", agencyName: "New Jersey START", agencyType: "state", state: "NJ", sourceUrl: "https://www.njstart.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true", searchUrl: "https://www.njstart.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true", domain: "njstart.gov", portalPlatform: "Periscope S2G / BSO", sourceLevel: "state", level: "state", accessMode: "portal", scraperType: "existing_parser", enabled: true, verificationStatus: "verified", notes: "Dedicated public listing/detail adapter for New Jersey START." },
];

const JAGGAER_SOURCES: PublicPortalSource[] = JAGGAER_SCIQUEST_TENANTS.filter((tenant) => tenant.capability === "dedicated_listing").map((tenant) => ({ id: tenant.portalId, agencyName: tenant.buyerName, agencyType: "state", state: tenant.state, sourceUrl: tenant.listingUrl, searchUrl: tenant.listingUrl, domain: new URL(tenant.listingUrl).hostname, portalPlatform: "Jaggaer / SciQuest", sourceLevel: "state", level: "state", accessMode: "portal", scraperType: "existing_parser", enabled: true, verificationStatus: "verified", notes: "Dedicated public Jaggaer/SciQuest event-listing adapter." }));
const BONFIRE_SOURCES: PublicPortalSource[] = BONFIRE_TENANTS.map((tenant) => ({ id: tenant.portalId, agencyName: tenant.buyerName, agencyType: "county", state: tenant.state, sourceUrl: tenant.listingUrl, searchUrl: tenant.listingUrl, domain: new URL(tenant.listingUrl).hostname, portalPlatform: "Bonfire / Euna", sourceLevel: "county", accessMode: "portal", scraperType: "existing_parser", enabled: true, verificationStatus: "verified", notes: "Dedicated public Bonfire/Euna opportunity-listing adapter." }));
const IONWAVE_SOURCES: PublicPortalSource[] = IONWAVE_TENANTS.map((tenant) => ({ id: tenant.portalId, agencyName: tenant.buyerName, agencyType: "county", state: tenant.state, sourceUrl: tenant.listingUrl, searchUrl: tenant.listingUrl, domain: new URL(tenant.listingUrl).hostname, portalPlatform: "IonWave / Euna", sourceLevel: "county", accessMode: "portal", scraperType: "existing_parser", enabled: true, verificationStatus: "verified", notes: "Dedicated public IonWave/Euna bid-listing adapter." }));
const CAL_EPROCURE_SOURCES: PublicPortalSource[] = [CAL_EPROCURE_SOURCE];
const DEEP_RECOVERY_SOURCES: PublicPortalSource[] = [
  GEORGIA_GAWORK_SOURCE,
  MINNESOTA_OSP_SOURCE,
  OREGON_BUYS_SOURCE,
];
const DEEP_RECOVERY_SOURCE_IDS = new Set(DEEP_RECOVERY_SOURCES.map((source) => source.id));
const STATEWIDE_SHARED_SOURCES = STATEWIDE_PROCUREMENT_SOURCES.filter((source) => !DEEP_RECOVERY_SOURCE_IDS.has(source.id));
const STATEWIDE_SOURCE_IDS = new Set(STATEWIDE_PROCUREMENT_SOURCES.map((source) => source.id));
const catalogPortalProvider = new PublicPortalProvidersProvider(
  PUBLIC_PORTAL_SOURCES.filter((source) => !STATEWIDE_SOURCE_IDS.has(source.id)),
);

interface DedicatedGroup {
  sources: PublicPortalSource[];
  providers: Record<string, DataSourceProvider>;
  statuses: Map<string, PublicPortalSourceRunStatus>;
}

const dedicatedGroups: DedicatedGroup[] = [
  { sources: BSO_SOURCES, providers: bsoPortalProviders, statuses: new Map() },
  { sources: JAGGAER_SOURCES, providers: jaggaerSciQuestProviders, statuses: new Map() },
  { sources: BONFIRE_SOURCES, providers: bonfirePortalProviders, statuses: new Map() },
  { sources: IONWAVE_SOURCES, providers: ionWavePortalProviders, statuses: new Map() },
  { sources: CAL_EPROCURE_SOURCES, providers: { [CAL_EPROCURE_SOURCE.id]: calEprocureProvider }, statuses: new Map() },
  {
    sources: DEEP_RECOVERY_SOURCES,
    providers: {
      [GEORGIA_GAWORK_SOURCE.id]: georgiaGaworkProvider,
      [MINNESOTA_OSP_SOURCE.id]: minnesotaOspProvider,
      [OREGON_BUYS_SOURCE.id]: oregonBuysProvider,
    },
    statuses: new Map(),
  },
  { sources: STATEWIDE_SHARED_SOURCES, providers: statewideProcurementProviders, statuses: new Map() },
];

async function hydrateDedicatedStatuses(): Promise<void> {
  const persisted = await loadPublicPortalHealth();
  for (const group of dedicatedGroups) {
    for (const source of group.sources) {
      const status = persisted.get(source.id);
      if (status) group.statuses.set(source.id, status);
    }
  }
}

async function saveDedicatedStatus(status: PublicPortalSourceRunStatus, target: Map<string, PublicPortalSourceRunStatus>, errors: string[]): Promise<void> {
  target.set(status.sourceId, status);
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
  for (const group of dedicatedGroups) for (const source of group.sources) byId.set(source.id, source);
  return Array.from(byId.values());
}

async function runDedicatedSource(
  source: PublicPortalSource,
  provider: DataSourceProvider | undefined,
  statuses: Map<string, PublicPortalSourceRunStatus>,
  options: FetchOptions,
  limit: number,
): Promise<ProviderFetchResult> {
  if (!provider) return { records: [], total: 0, errors: [`${source.id}: dedicated provider is not registered`] };
  const prior = statuses.get(source.id);
  const checkedAt = new Date();
  try {
    const result = await provider.fetch({ ...options, limit });
    const status = result.records.length === 0 && result.errors.length > 0
      ? failedPortalStatus(source, prior, checkedAt, result.errors.join("; "))
      : successfulPortalStatus(source, prior, new Date(), result.records.length, 0);
    await saveDedicatedStatus(status, statuses, result.errors);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const errors = [`${source.id}: ${reason}`];
    await saveDedicatedStatus(failedPortalStatus(source, prior, checkedAt, reason), statuses, errors);
    return { records: [], total: 0, errors };
  }
}

class CombinedPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    return (await catalogPortalProvider.isConfigured().catch(() => false))
      || dedicatedGroups.some((group) => group.sources.some((source) => Boolean(group.providers[source.id])));
  }

  getSources(): PublicPortalSource[] {
    return mergedSources();
  }

  getSourceStatuses(): PublicPortalSourceRunStatus[] {
    const byId = new Map(catalogPortalProvider.getSourceStatuses().map((status) => [status.sourceId, status]));
    for (const group of dedicatedGroups) for (const status of group.statuses.values()) byId.set(status.sourceId, status);
    return Array.from(byId.values()).sort((left, right) => right.lastCheckedAt.getTime() - left.lastCheckedAt.getTime());
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const requestedLimit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const offset = Math.max(options.offset ?? 0, 0);
    const target = Math.min(300, offset + requestedLimit);
    const sourceOptions: FetchOptions = { ...options, limit: target, offset: 0 };
    const errors: string[] = [];
    try {
      await hydrateDedicatedStatuses();
    } catch (error) {
      errors.push(`dedicated-portal-health-load: ${error instanceof Error ? error.message : String(error)}`);
    }
    const tasks = dedicatedGroups.flatMap((group) => group.sources.map((source) => runDedicatedSource(source, group.providers[source.id], group.statuses, sourceOptions, target)));
    const settled = await Promise.allSettled([...tasks, catalogPortalProvider.fetch(sourceOptions)]);
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
    const statuses = dedicatedGroups.flatMap((group) => Array.from(group.statuses.values()));
    const failures = statuses.filter((status) => status.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt));
    const dates = statuses.map((status) => status.lastCheckedAt).concat(base?.lastAttempt ? [base.lastAttempt] : []);
    const successes = statuses.flatMap((status) => status.lastSuccessAt ? [status.lastSuccessAt] : []).concat(base?.lastSuccess ? [base.lastSuccess] : []);
    return {
      name: this.name,
      configured: Boolean(base?.configured) || dedicatedGroups.some((group) => group.sources.length > 0),
      healthy: failures.length === 0 && (base?.healthy ?? true),
      errorMessage: [
        base?.errorMessage,
        failures.length ? `${failures.length} dedicated portal${failures.length === 1 ? " is" : "s are"} currently failing` : undefined,
      ].filter(Boolean).join("; ") || undefined,
      recordCount: (base?.recordCount ?? 0) + statuses.reduce((sum, status) => sum + status.resultCount, 0),
      lastAttempt: dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined,
      lastSuccess: successes.length ? new Date(Math.max(...successes.map((date) => date.getTime()))) : undefined,
    };
  }
}

export const publicPortalProvidersProvider = new CombinedPublicPortalProvider();
