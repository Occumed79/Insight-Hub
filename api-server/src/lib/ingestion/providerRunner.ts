import { providerRegistry } from "../providers";
import type { NormalizedOpportunity } from "../providers/types";
import { partitionProviderRecordsForQuery } from "../providers/providerQueryMatch";
import { webIntelligenceFetch } from "../search/webIntelligence";
import { filterExpiredOpportunities } from "./opportunityExpiration";

export const PROVIDER_ALIASES = new Map<string, string>([
  ["sam_gov", "samGov"],
  ["public_portal_providers", "publicPortalProviders"],
  ["publicPortals", "publicPortalProviders"],
  ["public_portals", "publicPortalProviders"],
  ["statePortals", "publicPortalProviders"],
  ["euna_bonfire", "eunaBonfire"],
  ["eunaSupplierNetwork", "eunaBonfire"],
  ["international_public_portals", "internationalPublicPortals"],
  ["internationalOpportunities", "internationalPublicPortals"],
]);

export const MANUAL_RFP_PROVIDERS = new Set([
  "samGov",
  "publicPortalProviders",
  "eunaBonfire",
  "internationalPublicPortals",
  "tango",
  "bidnet",
  "serper",
  "tavily",
  "exa",
]);

const WEB_DISCOVERY_PROVIDERS = new Set(["serper", "tavily", "exa"]);

export interface ProviderRunResult {
  records: NormalizedOpportunity[];
  errors: string[];
  expiredSkipped?: number;
}

export function resolveManualProviders(providers?: string[]): string[] {
  const resolved = Array.from(
    new Set(
      (providers?.length ? providers : ["samGov"]).map(
        (provider) => PROVIDER_ALIASES.get(provider) ?? provider,
      ),
    ),
  );
  const unsupported = resolved.filter(
    (provider) => !MANUAL_RFP_PROVIDERS.has(provider),
  );
  if (unsupported.length > 0)
    throw new Error(`Unsupported RFP provider(s): ${unsupported.join(", ")}`);
  return resolved;
}

function applyProviderGuards(
  provider: string,
  records: NormalizedOpportunity[],
  errors: string[],
  keywords?: string,
): ProviderRunResult {
  // The audited public-portal provider already partitions each portal before
  // source-fair merging. Other top-level providers receive the same query guard
  // here, but retain a bounded mismatch sample for raw/staging diagnostics.
  const admitted =
    provider === "publicPortalProviders"
      ? records
      : (() => {
          const partition = partitionProviderRecordsForQuery(records, keywords, 3);
          if (partition.rejectedCount > 0) {
            console.info(
              JSON.stringify({
                event: "rfp_provider_query_partitioned",
                provider,
                query: keywords,
                returned: partition.rawCount,
                matched: partition.matchedCount,
                rejected: partition.rejectedCount,
                retainedRejectionSamples: partition.rejectedSamples.length,
              }),
            );
          }
          return [...partition.matched, ...partition.rejectedSamples];
        })();

  const filtered = filterExpiredOpportunities(admitted);
  if (filtered.expiredSkipped > 0) {
    console.info(
      JSON.stringify({
        event: "rfp_expired_records_skipped",
        provider,
        expiredSkipped: filtered.expiredSkipped,
        reasons: filtered.reasons,
      }),
    );
  }
  return {
    records: filtered.records,
    errors,
    expiredSkipped: filtered.expiredSkipped,
  };
}

export async function fetchOneProvider(
  provider: string,
  options: { keywords?: string; dateRange?: number; signal?: AbortSignal },
): Promise<ProviderRunResult> {
  if (WEB_DISCOVERY_PROVIDERS.has(provider)) {
    const result = await webIntelligenceFetch({
      keywords: options.keywords,
      useSerper: provider === "serper",
      useTavily: provider === "tavily",
      useExa: provider === "exa",
      signal: options.signal,
    });
    return applyProviderGuards(
      provider,
      result.opportunities.filter((record) => record.source === provider),
      result.errors,
      options.keywords,
    );
  }

  const source = providerRegistry[provider as keyof typeof providerRegistry];
  if (!source) throw new Error(`Unknown RFP provider: ${provider}`);
  const result = await source.fetch({
    keywords: options.keywords,
    dateRange: options.dateRange,
    limit: 100,
    signal: options.signal,
  });
  return applyProviderGuards(
    provider,
    result.records,
    result.errors ?? [],
    options.keywords,
  );
}
