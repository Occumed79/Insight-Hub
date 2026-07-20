/**
 * Compatibility collector for callers that need a provider batch in memory.
 *
 * Persistence intentionally lives in the manual ingestion service. This module
 * never writes provider output directly to `opportunities`.
 */
import type { NormalizedOpportunity } from "../providers/types";
import {
  fetchOneProvider,
  resolveManualProviders,
} from "../ingestion/providerRunner";

export interface UnifiedFetchOptions {
  keywords?: string;
  dateRange?: number;
  providers?: string[];
}

export interface UnifiedFetchResult {
  fetched: number;
  records: NormalizedOpportunity[];
  providerResults: Array<{
    provider: string;
    fetched: number;
    errors: string[];
  }>;
}

export async function unifiedFetch(
  options: UnifiedFetchOptions = {},
): Promise<UnifiedFetchResult> {
  const providers = resolveManualProviders(options.providers);
  const result: UnifiedFetchResult = {
    fetched: 0,
    records: [],
    providerResults: [],
  };

  // Sequential collection is deliberately bounded. The persisted manual-run
  // workflow uses the same one-provider-at-a-time behavior.
  for (const provider of providers) {
    try {
      const providerResult = await fetchOneProvider(provider, options);
      result.records.push(...providerResult.records);
      result.fetched += providerResult.records.length;
      result.providerResults.push({
        provider,
        fetched: providerResult.records.length,
        errors: providerResult.errors,
      });
    } catch (error) {
      result.providerResults.push({
        provider,
        fetched: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      });
    }
  }
  return result;
}
