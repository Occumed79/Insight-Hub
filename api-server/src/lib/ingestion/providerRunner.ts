import type {
  NormalizedOpportunity,
  ProviderProgressEvent,
} from "../providers/types";
import { partitionProviderRecordsForQuery } from "../providers/providerQueryMatch";
import { filterExpiredOpportunities } from "./opportunityExpiration";

export const PROVIDER_ALIASES = new Map<string, string>([
  ["sam_gov", "samGov"],
  ["ai_discovery", "aiDiscovery"],
  ["webIntelligence", "aiDiscovery"],
  ["publicPortalProviders", "aiDiscovery"],
  ["eunaBonfire", "aiDiscovery"],
  ["internationalPublicPortals", "aiDiscovery"],
  ["public_portal_providers", "aiDiscovery"],
  ["publicPortals", "aiDiscovery"],
  ["public_portals", "aiDiscovery"],
  ["statePortals", "aiDiscovery"],
  ["euna_bonfire", "aiDiscovery"],
  ["eunaSupplierNetwork", "aiDiscovery"],
  ["international_public_portals", "aiDiscovery"],
  ["internationalOpportunities", "aiDiscovery"],
]);

export const MANUAL_RFP_PROVIDERS = new Set([
  "samGov",
  "aiDiscovery",
]);

const WEB_DISCOVERY_PROVIDERS = new Set(["serper", "exa", "langsearch"]);

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
      (providers?.length ? providers : ["samGov", "aiDiscovery"]).map(
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
  const admitted = [...partition.matched, ...partition.rejectedSamples];

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
): Promise<ProviderRunResult> {
  const runtime = await loadDiscoveryRuntime();
  const [useSerper, useExa, useLangsearch] = await Promise.all([
    runtime.serperProvider.isConfigured().catch(() => false),
    runtime.exaProvider.isConfigured().catch(() => false),
    runtime.langsearchProvider.isConfigured().catch(() => false),
  ]);
  if (!useSerper && !useExa && !useLangsearch) {
    return {
      records: [],
      errors: [
        "AI Opportunity Discovery could not run because none of Serper, Exa, or LangSearch is configured.",
      ],
    };
  }

  const result = await runtime.webIntelligenceFetch({
    keywords: options.keywords,
    useSerper,
    useExa,
    useLangsearch,
    signal: options.signal,
  });
  for (const error of result.errors) {
    console.warn(`[aiDiscovery] ${error}`);
  }
  console.info(
    JSON.stringify({
      event: "ai_opportunity_discovery",
      query: options.keywords,
      serper: useSerper,
      exa: useExa,
      langsearch: useLangsearch,
      candidates: result.stats.totalCandidates,
      preFiltered: result.stats.preFiltered,
      accepted: result.opportunities.length,
      aiScorers: result.stats.aiScorers,
      errors: result.errors.length,
    }),
  );
  return {
    records: result.opportunities,
    errors: result.errors,
  };
}

export async function fetchOneProvider(
  provider: string,
  options: ProviderRunnerOptions,
): Promise<ProviderRunResult> {
  if (provider === "aiDiscovery") {
    const result = await fetchConfiguredAiDiscovery(options);
    return applyProviderGuards(
      provider,
      result.records,
      result.errors,
      options.keywords,
    );
  }

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
