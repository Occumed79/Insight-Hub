import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { bsoPortalProviders } from "./bsoPortal";
import { bonfirePortalProvider, BONFIRE_TENANTS } from "./bonfirePortal";
import { ionWavePortalProvider, IONWAVE_TENANTS } from "./ionWavePortal";
import { bidExpressPortalProvider, BIDEXPRESS_TENANTS } from "./bidExpressPortal";
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

// ─── Platform family sources (Bonfire, IonWave, BidExpress) ───────────────────
//
// Each platform's source list is derived from its TENANTS array.
// When a catalog entry is added with a direct platform URL, add the tenant
// to the relevant *Portal.ts TENANTS array and it will appear here automatically.

function bonfireSources(): PublicPortalSource[] {
  return BONFIRE_TENANTS.map((t) => ({
    id: t.portalId,
    agencyName: t.buyerName,
    agencyType: "special_district" as const,
    state: t.jurisdiction,
    sourceUrl: `https://${t.tenantSlug}.bonfirehub.com/opportunities`,
    searchUrl: `https://${t.tenantSlug}.bonfirehub.com/opportunities?status=open`,
    domain: "bonfirehub.com",
    portalPlatform: "Bonfire / Euna Supplier Network",
    sourceLevel: "district" as const,
    level: "district" as const,
    accessMode: "portal" as const,
    scraperType: "existing_parser" as const,
    enabled: t.publicListing,
    verificationStatus: t.publicListing ? "verified" as const : "needs_review" as const,
    notes: t.skipReason
      ? `Bonfire tenant ${t.tenantSlug} — skipped: ${t.skipReason}`
      : `Dedicated Bonfire direct adapter for ${t.buyerName}.`,
  }));
}

function ionWaveSources(): PublicPortalSource[] {
  return IONWAVE_TENANTS.map((t) => ({
    id: t.portalId,
    agencyName: t.buyerName,
    agencyType: "special_district" as const,
    state: t.jurisdiction,
    sourceUrl: `https://go.ionwave.net/${t.tenantId}/bids`,
    searchUrl: `https://go.ionwave.net/${t.tenantId}/bids`,
    domain: "go.ionwave.net",
    portalPlatform: "IonWave",
    sourceLevel: "district" as const,
    level: "district" as const,
    accessMode: "portal" as const,
    scraperType: "existing_parser" as const,
    enabled: t.publicListing,
    verificationStatus: t.publicListing ? "verified" as const : "needs_review" as const,
    notes: t.skipReason
      ? `IonWave tenant ${t.tenantId} — skipped: ${t.skipReason}`
      : `Dedicated IonWave direct adapter for ${t.buyerName}.`,
  }));
}

function bidExpressSources(): PublicPortalSource[] {
  return BIDEXPRESS_TENANTS.map((t) => ({
    id: t.portalId,
    agencyName: t.buyerName,
    agencyType: "special_district" as const,
    state: t.jurisdiction,
    sourceUrl: `https://www.bidexpress.com/businesses/${t.businessId}/bids`,
    searchUrl: `https://www.bidexpress.com/businesses/${t.businessId}/bids`,
    domain: "bidexpress.com",
    portalPlatform: "BidExpress",
    sourceLevel: "district" as const,
    level: "district" as const,
    accessMode: "portal" as const,
    scraperType: "existing_parser" as const,
    enabled: t.publicListing,
    verificationStatus: t.publicListing ? "verified" as const : "needs_review" as const,
    notes: t.skipReason
      ? `BidExpress tenant ${t.businessId} — skipped: ${t.skipReason}`
      : `Dedicated BidExpress direct adapter for ${t.buyerName}.`,
  }));
}

// ─── Persistent health ────────────────────────────────────────────────────────

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
  for (const source of bonfireSources()) byId.set(source.id, source);
  for (const source of ionWaveSources()) byId.set(source.id, source);
  for (const source of bidExpressSources()) byId.set(source.id, source);
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
    return (await catalogPortalProvider.isConfigured().catch(() => false))
      || BSO_SOURCES.some((source) => Boolean(bsoPortalProviders[source.id]))
      || BONFIRE_TENANTS.length > 0
      || IONWAVE_TENANTS.length > 0
      || BIDEXPRESS_TENANTS.length > 0;
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
    const perBsoSource = Math.max(1, Math.ceil(limit / Math.max(BSO_SOURCES.length, 1)));
    const errors: string[] = [];
    try {
      await hydrateBsoStatuses();
    } catch (error) {
      errors.push(`bso-health-load: ${error instanceof Error ? error.message : String(error)}`);
    }

    const settled = await Promise.allSettled([
      ...BSO_SOURCES.map((source) => runBsoSource(source, options, perBsoSource)),
      // Platform family adapters — each runs its own bounded per-tenant fetch
      bonfirePortalProvider.fetch({ ...options, limit }),
      ionWavePortalProvider.fetch({ ...options, limit }),
      bidExpressPortalProvider.fetch({ ...options, limit }),
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
    const platformTenantCount = BONFIRE_TENANTS.length + IONWAVE_TENANTS.length + BIDEXPRESS_TENANTS.length;
    return {
      name: this.name,
      configured: Boolean(base?.configured) || BSO_SOURCES.length > 0 || platformTenantCount > 0,
      healthy: failures.length === 0 && (base?.healthy ?? true),
      errorMessage: [
        base?.errorMessage,
        failures.length ? `${failures.length} BSO-family portal${failures.length === 1 ? " is" : "s are"} currently failing` : undefined,
      ].filter(Boolean).join("; ") || undefined,
      recordCount: (base?.recordCount ?? 0) + statuses.reduce((sum, status) => sum + status.resultCount, 0),
      lastAttempt: dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined,
      lastSuccess: successes.length ? new Date(Math.max(...successes.map((date) => date.getTime()))) : undefined,
    };
  }
}

export const publicPortalProvidersProvider = new CombinedPublicPortalProvider();
