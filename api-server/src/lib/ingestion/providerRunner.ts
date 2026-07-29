import type {
  NormalizedOpportunity,
  ProviderProgressEvent,
} from "../providers/types";
import { partitionProviderRecordsForQuery } from "../providers/providerQueryMatch";
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
  "exa",
  "langsearch",
]);

const WEB_DISCOVERY_PROVIDERS = new Set(["serper", "exa", "langsearch"]);
const DIRECT_RESULT_SHARE = 0.7;

export interface ProviderRunResult {
  records: NormalizedOpportunity[];
  errors: string[];
  expiredSkipped?: number;
}

export interface ProviderRunnerOptions {
  keywords?: string;
  dateRange?: number;
  signal?: AbortSignal;
  onProgress?: (event: ProviderProgressEvent) => void | Promise<void>;
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
  if (unsupported.length > 0) {
    throw new Error(`Unsupported RFP provider(s): ${unsupported.join(", ")}`);
  }
  return resolved;
}

function applyProviderGuards(
  provider: string,
  records: NormalizedOpportunity[],
  errors: string[],
  keywords?: string,
): ProviderRunResult {
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
  if (record.sourceUrl?.trim()) {
    return `url:${record.sourceUrl.trim().toLowerCase()}`;
  }
  return `id:${record.externalId.toLowerCase()}`;
}

function mergeDirectAndDiscovery(
  direct: NormalizedOpportunity[],
  discovery: NormalizedOpportunity[],
  limit: number,
): NormalizedOpportunity[] {
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (boundedLimit === 0) return [];

  const directKeys = new Set<string>();
  const uniqueDirect: NormalizedOpportunity[] = [];
  for (const record of direct) {
    const key = recordKey(record);
    if (directKeys.has(key)) continue;
    directKeys.add(key);
    uniqueDirect.push(record);
  }

  const uniqueDiscovery: NormalizedOpportunity[] = [];
  const discoveryKeys = new Set<string>();
  for (const record of discovery) {
    const key = recordKey(record);
    if (directKeys.has(key) || discoveryKeys.has(key)) continue;
    discoveryKeys.add(key);
    uniqueDiscovery.push(record);
  }

  if (uniqueDirect.length === 0) return uniqueDiscovery.slice(0, boundedLimit);
  if (uniqueDiscovery.length === 0) return uniqueDirect.slice(0, boundedLimit);

  const directTarget = Math.min(
    uniqueDirect.length,
    Math.max(1, Math.ceil(boundedLimit * DIRECT_RESULT_SHARE)),
  );
  const merged = uniqueDirect.slice(0, directTarget);
  merged.push(
    ...uniqueDiscovery.slice(0, Math.max(0, boundedLimit - merged.length)),
  );

  if (merged.length < boundedLimit) {
    merged.push(
      ...uniqueDirect.slice(
        directTarget,
        directTarget + boundedLimit - merged.length,
      ),
    );
  }
  if (merged.length < boundedLimit) {
    const usedDiscovery = Math.max(0, boundedLimit - directTarget);
    merged.push(
      ...uniqueDiscovery.slice(
        usedDiscovery,
        usedDiscovery + boundedLimit - merged.length,
      ),
    );
  }

  return merged.slice(0, boundedLimit);
}

async function loadDiscoveryRuntime() {
  const [serper, exa, langsearch, intelligence] = await Promise.all([
    import("../providers/serper"),
    import("../providers/exa"),
    import("../providers/langsearch"),
    import("../search/webIntelligence"),
  ]);
  return {
    serperProvider: serper.serperProvider,
    exaProvider: exa.exaProvider,
    langsearchProvider: langsearch.langsearchProvider,
    webIntelligenceFetch: intelligence.webIntelligenceFetch,
  };
}

async function fetchConfiguredAiDiscovery(
  options: ProviderRunnerOptions,
): Promise<NormalizedOpportunity[]> {
  const runtime = await loadDiscoveryRuntime();
  const [useSerper, useExa, useLangsearch] = await Promise.all([
    runtime.serperProvider.isConfigured().catch(() => false),
    runtime.exaProvider.isConfigured().catch(() => false),
    runtime.langsearchProvider.isConfigured().catch(() => false),
  ]);
  if (!useSerper && !useExa && !useLangsearch) return [];

  const result = await runtime.webIntelligenceFetch({
    keywords: options.keywords,
    useSerper,
    useExa,
    useLangsearch,
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
      exa: useExa,
      langsearch: useLangsearch,
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
  options: ProviderRunnerOptions,
): Promise<ProviderRunResult> {
  if (WEB_DISCOVERY_PROVIDERS.has(provider)) {
    const { webIntelligenceFetch } = await loadDiscoveryRuntime();
    const result = await webIntelligenceFetch({
      keywords: options.keywords,
      useSerper: provider === "serper",
      useExa: provider === "exa",
      useLangsearch: provider === "langsearch",
      signal: options.signal,
    });
    return applyProviderGuards(
      provider,
      result.opportunities.filter((record) => record.source === provider),
      result.errors,
      options.keywords,
    );
  }

  // Loading the registry is deliberately deferred until ingestion actually
  // starts. Importing it during API bootstrap instantiates every portal adapter,
  // browser connector, and AI integration in the 512 MB web process.
  const { providerRegistry } = await import("../providers");
  const source = providerRegistry[provider as keyof typeof providerRegistry];
  if (!source) throw new Error(`Unknown RFP provider: ${provider}`);

  if (provider === "publicPortalProviders") {
    const [directResult, discoveryRecords] = await Promise.all([
      source.fetch({
        keywords: options.keywords,
        dateRange: options.dateRange,
        limit: 100,
        signal: options.signal,
        onProgress: options.onProgress,
      }),
      fetchConfiguredAiDiscovery(options).catch((error) => {
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
      mergeDirectAndDiscovery(directResult.records, discoveryRecords, 100),
      directResult.errors ?? [],
      options.keywords,
    );
  }

  const result = await source.fetch({
    keywords: options.keywords,
    dateRange: options.dateRange,
    limit: 100,
    signal: options.signal,
    onProgress: options.onProgress,
  });
  return applyProviderGuards(
    provider,
    result.records,
    result.errors ?? [],
    options.keywords,
  );
}
