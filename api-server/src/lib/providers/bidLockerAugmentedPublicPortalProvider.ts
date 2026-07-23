import { bidLockerPortalProvider } from "./bidLockerPortal";
import { crawlerAugmentedPublicPortalProvider } from "./crawlerAugmentedPublicPortalProvider";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";

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
    return `sol:${record.solicitationNumber
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()}`;
  }
  return `id:${record.externalId.toLowerCase()}`;
}

function latestDate(...values: Array<Date | undefined>): Date | undefined {
  return values.reduce<Date | undefined>((latest, value) => {
    if (!value) return latest;
    return !latest || value > latest ? value : latest;
  }, undefined);
}

class BidLockerAugmentedPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    const [baseConfigured, bidLockerConfigured] = await Promise.all([
      crawlerAugmentedPublicPortalProvider.isConfigured().catch(() => false),
      bidLockerPortalProvider.isConfigured().catch(() => false),
    ]);
    return baseConfigured || bidLockerConfigured;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const [baseResult, bidLockerResult] = await Promise.all([
      crawlerAugmentedPublicPortalProvider.fetch(options),
      bidLockerPortalProvider.fetch(options),
    ]);
    const seen = new Set<string>();
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const records = [...baseResult.records, ...bidLockerResult.records]
      .filter((record) => {
        const key = recordKey(record);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);

    return {
      records,
      total: records.length,
      errors: [...baseResult.errors, ...bidLockerResult.errors],
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    const [base, bidLocker] = await Promise.all([
      crawlerAugmentedPublicPortalProvider.getStatus(),
      bidLockerPortalProvider.getStatus(),
    ]);
    const errorMessage = [base.errorMessage, bidLocker.errorMessage]
      .filter(Boolean)
      .join("; ");

    return {
      ...base,
      configured: base.configured || bidLocker.configured,
      healthy: base.healthy && bidLocker.healthy,
      errorMessage: errorMessage || undefined,
      recordCount: (base.recordCount ?? 0) + (bidLocker.recordCount ?? 0),
      lastAttempt: latestDate(base.lastAttempt, bidLocker.lastAttempt),
      lastSuccess: latestDate(base.lastSuccess, bidLocker.lastSuccess),
    };
  }
}

export const bidLockerAugmentedPublicPortalProvider =
  new BidLockerAugmentedPublicPortalProvider();
