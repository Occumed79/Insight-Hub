import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  publicPortalProvidersProvider as catalogPortalProvider,
  type PublicPortalSourceRunStatus,
} from "./publicPortalProviders/index";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import { bsoPublicPortalProvider } from "./bsoPortal";
import { BSO_PUBLIC_PORTAL_SOURCES } from "./bsoPortalCore";

export * from "./publicPortalProviders/index";
export * from "./bsoPortal";
export * from "./bsoPortalCore";

function recordKey(record: NormalizedOpportunity): string {
  const portalId = typeof record.rawData?.portalId === "string" ? record.rawData.portalId : "";
  const sourceId = typeof record.rawData?.sourceId === "string" ? record.rawData.sourceId : "";
  const solicitation = record.solicitationNumber?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (solicitation) return `sol:${portalId || sourceId}:${solicitation}`;
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

function mergeSources(): PublicPortalSource[] {
  const replacements = new Map(BSO_PUBLIC_PORTAL_SOURCES.map((source) => [source.id, source]));
  const sources = catalogPortalProvider.getSources().map((source) => replacements.get(source.id) ?? source);
  const existing = new Set(sources.map((source) => source.id));
  for (const source of BSO_PUBLIC_PORTAL_SOURCES) {
    if (!existing.has(source.id)) sources.push(source);
  }
  return sources;
}

class CombinedPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    const [catalogConfigured, bsoConfigured] = await Promise.all([
      catalogPortalProvider.isConfigured().catch(() => false),
      bsoPublicPortalProvider.isConfigured().catch(() => false),
    ]);
    return catalogConfigured || bsoConfigured;
  }

  getSources(): PublicPortalSource[] {
    return mergeSources();
  }

  getSourceStatuses(): PublicPortalSourceRunStatus[] {
    const bySource = new Map<string, PublicPortalSourceRunStatus>();
    for (const status of catalogPortalProvider.getSourceStatuses()) bySource.set(status.sourceId, status);
    for (const status of bsoPublicPortalProvider.getSourceStatuses()) bySource.set(status.sourceId, status);
    return Array.from(bySource.values()).sort((left, right) => right.lastCheckedAt.getTime() - left.lastCheckedAt.getTime());
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const [bso, catalog] = await Promise.allSettled([
      bsoPublicPortalProvider.fetch({ ...options, limit }),
      catalogPortalProvider.fetch({ ...options, limit }),
    ]);
    const errors: string[] = [];
    const candidates: NormalizedOpportunity[] = [];

    if (bso.status === "fulfilled") {
      candidates.push(...bso.value.records);
      errors.push(...bso.value.errors);
    } else {
      errors.push(`bso-shared-adapter: ${bso.reason instanceof Error ? bso.reason.message : String(bso.reason)}`);
    }
    if (catalog.status === "fulfilled") {
      candidates.push(...catalog.value.records);
      errors.push(...catalog.value.errors);
    } else {
      errors.push(`public-portal-catalog: ${catalog.reason instanceof Error ? catalog.reason.message : String(catalog.reason)}`);
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
    const [bso, catalog] = await Promise.allSettled([
      bsoPublicPortalProvider.getStatus(),
      catalogPortalProvider.getStatus(),
    ]);
    const statuses = [
      ...(bso.status === "fulfilled" ? [bso.value] : []),
      ...(catalog.status === "fulfilled" ? [catalog.value] : []),
    ];
    const configured = statuses.some((status) => status.configured);
    const healthy = configured && statuses.filter((status) => status.configured).every((status) => status.healthy);
    const errors = [
      ...(bso.status === "rejected" ? [`BSO adapter status failed: ${String(bso.reason)}`] : bso.value.errorMessage ? [bso.value.errorMessage] : []),
      ...(catalog.status === "rejected" ? [`Catalog provider status failed: ${String(catalog.reason)}`] : catalog.value.errorMessage ? [catalog.value.errorMessage] : []),
    ];
    const dates = statuses.flatMap((status) => status.lastAttempt ? [status.lastAttempt] : []);
    const successes = statuses.flatMap((status) => status.lastSuccess ? [status.lastSuccess] : []);
    return {
      name: this.name,
      configured,
      healthy,
      errorMessage: errors.length ? errors.join("; ") : undefined,
      recordCount: statuses.reduce((sum, status) => sum + (status.recordCount ?? 0), 0),
      lastAttempt: dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined,
      lastSuccess: successes.length ? new Date(Math.max(...successes.map((date) => date.getTime()))) : undefined,
    };
  }
}

export const publicPortalProvidersProvider = new CombinedPublicPortalProvider();
