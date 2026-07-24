import { providerRegistry } from "../providers";
import type { NormalizedOpportunity } from "../providers/types";
import { partitionProviderRecordsForQuery } from "../providers/providerQueryMatch";
import { serperProvider } from "../providers/serper";
import { tavilyProvider } from "../providers/tavily";
import { exaProvider } from "../providers/exa";
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
  // The audited public-portal provider partitions each portal before source-fair
  // merging and then applies the Cloudflare/Cerebras adjudication layer. Other
  // top-level providers receive the shared query guard here.
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

function recordKey(record: NormalizedOpportunity): string {
  if (record.sourceUrl?.trim()) return `url:${record.sourceUrl.trim().toLowerCase()}`;
  return `id:${record.externalId.toLowerCase()}`;
}

function mergeDiscoveryFirst(
  discovery: NormalizedOpportunity[],
  direct: NormalizedOpportunity[],
  limit: number,
): NormalizedOpportunity[] {
  const seen = new Set<string>();
  const merged: NormalizedOpportunity[] = [];
  for (const record of [...discovery, ...direct]) {
    const key = recordKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
    if (merged.length >= limit) break;
  }
  return merged;
}

async function fetchConfiguredAiDiscovery(options: {
  keywords?: string;
  signal?: AbortSignal;
}): Promise<NormalizedOpportunity[]> {
  const [useSerper, useTavily, useExa] = await Promise.all([
    serperProvider.isConfigured().catch(() => false),
    tavilyProvider.isConfigured().catch(() => false),
    exaProvider.isConfigured().catch(() => false),
  ]);
  if (!useSerper && !useTavily && !useExa) return [];

  const result = await webIntelligenceFetch({
    keywords: options.keywords,
    useSerper,
    useTavily,
    useExa,
    signal: options.signal,
  });
  for (const error of result.errors) {
    console.warn(`[publicPortalProviders:ai-discovery] ${error}`);
  }
  console.info(
    JSON.stringify({
      event: "public_portal_ai_discovery",
      query: options.keywords,
      serper: useSerper,
      tavily: useTavily,
      exa: useExa,
      candidates: result.stats.totalCandidates,
      preFiltered: result.stats.preFiltered,
      accepted: result.opportunities.length,
      aiScorers: result.stats.aiScorers,
    }),
  );
  return result.opportunities;
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

  if (provider === "publicPortalProviders") {
    const [directResult, discoveryRecords] = await Promise.all([
      source.fetch({
        keywords: options.keywords,
        dateRange: options.dateRange,
        limit: 100,
        signal: options.signal,
      }),
      fetchConfiguredAiDiscovery({
        keywords: options.keywords,
        signal: options.signal,
      }).catch((error) => {
        console.warn(
          `[publicPortalProviders:ai-discovery] ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [];
      }),
    ]);
    return applyProviderGuards(
      provider,
      mergeDiscoveryFirst(discoveryRecords, directResult.records, 100),
      directResult.errors ?? [],
      options.keywords,
    );
  }

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
