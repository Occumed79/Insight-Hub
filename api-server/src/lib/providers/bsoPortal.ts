import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import {
  failedPortalStatus,
  loadPublicPortalHealth,
  savePublicPortalHealth,
  successfulPortalStatus,
  type PublicPortalSourceRunStatus,
} from "./publicPortalProviders/portalHealthStore";
import {
  fetchBsoTenant,
  mapConcurrent,
} from "./bsoPortalRuntime";
import { BSO_PUBLIC_PORTAL_SOURCES, BSO_TENANTS } from "./bsoPortalCore";

const statuses = new Map<string, PublicPortalSourceRunStatus>();
async function hydrate(): Promise<void> { const persisted = await loadPublicPortalHealth(); for (const tenant of BSO_TENANTS) { const status = persisted.get(tenant.id); if (status) statuses.set(tenant.id, status); } }
async function persist(status: PublicPortalSourceRunStatus, errors: string[]): Promise<void> { statuses.set(status.sourceId, status); try { await savePublicPortalHealth(status); } catch (error) { errors.push(`${status.sourceId}: portal health persistence failed: ${error instanceof Error ? error.message : String(error)}`); } }

export class BsoPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  async isConfigured(): Promise<boolean> { return true; }
  getSources(): PublicPortalSource[] { return BSO_PUBLIC_PORTAL_SOURCES.map((source) => ({ ...source })); }
  getSourceStatuses(): PublicPortalSourceRunStatus[] { return Array.from(statuses.values()).sort((a, b) => b.lastCheckedAt.getTime() - a.lastCheckedAt.getTime()); }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const perTenant = Math.max(1, Math.ceil(limit / BSO_TENANTS.length));
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    try { await hydrate(); } catch (error) { errors.push(`bso-health-load: ${error instanceof Error ? error.message : String(error)}`); }
    await mapConcurrent(BSO_TENANTS, 2, async (tenant) => {
      const source = BSO_PUBLIC_PORTAL_SOURCES.find((candidate) => candidate.id === tenant.id)!;
      const prior = statuses.get(tenant.id);
      const checkedAt = new Date();
      try {
        const result = await fetchBsoTenant(tenant, options, perTenant);
        records.push(...result.records);
        errors.push(...result.errors);
        await persist(successfulPortalStatus(source, prior, new Date(), result.records.length, result.records.filter((record) => record.rawData?.occuMedMatched === true).length), errors);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${tenant.id}: ${reason}`);
        await persist(failedPortalStatus(source, prior, checkedAt, reason), errors);
      }
      return undefined;
    });
    const seen = new Set<string>();
    const deduped = records.filter((record) => { const key = `${record.rawData?.portalId}:${record.solicitationNumber ?? record.externalId}`.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit);
    return { records: deduped, total: deduped.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    try { await hydrate(); } catch { /* retain in-memory status */ }
    const sourceStatuses = this.getSourceStatuses();
    const failures = sourceStatuses.filter((status) => status.lastFailureAt && (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt));
    const latest = (field: "lastCheckedAt" | "lastSuccessAt") => sourceStatuses.reduce<Date | undefined>((value, status) => { const date = status[field]; return date && (!value || date > value) ? date : value; }, undefined);
    return {
      name: this.name,
      configured: true,
      healthy: failures.length === 0,
      errorMessage: failures.length ? `${failures.length} BSO-family portal${failures.length === 1 ? " is" : "s are"} currently failing` : undefined,
      lastAttempt: latest("lastCheckedAt"),
      lastSuccess: latest("lastSuccessAt"),
      recordCount: sourceStatuses.reduce((sum, status) => sum + status.resultCount, 0),
    };
  }
}

export const bsoPublicPortalProvider = new BsoPublicPortalProvider();
