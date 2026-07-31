import type {
  NormalizedOpportunity,
  ProviderProgressEvent,
} from "../providers/types";
import { partitionProviderRecordsForQuery } from "../providers/providerQueryMatch";
import { filterExpiredOpportunities } from "./opportunityExpiration";

export const PROVIDER_ALIASES = new Map<string, string>([
  ["sam_gov", "samGov"],
  ["tango_api", "tango"],
  ["tangoApi", "tango"],
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

// GovCon is deliberately excluded from open-opportunity ingestion. Its trial
// allowance is reserved for the Forecasts and Recompete Watch workspaces,
// where its forecast/incumbent data is differentiated and useful.
export const FEDERAL_MANUAL_PROVIDERS = ["samGov", "tango"] as const;
const FEDERAL_MANUAL_PROVIDER_SET = new Set<string>(FEDERAL_MANUAL_PROVIDERS);

export const MANUAL_RFP_PROVIDERS = new Set([
  ...FEDERAL_MANUAL_PROVIDERS,
  "aiDiscovery",
]);

const WEB_DISCOVERY_PROVIDERS = new Set(["serper", "exa", "langsearch"]);
const DEFAULT_OCCUMED_QUERY = "occupational health services";

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
      (providers?.length ? providers : ["tango", "aiDiscovery"]).map(
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

  const includesFederalSource = resolved.some((provider) =>
    FEDERAL_MANUAL_PROVIDER_SET.has(provider),
  );
  if (!includesFederalSource) return resolved;

  return [
    ...FEDERAL_MANUAL_PROVIDERS,
    ...resolved.filter((provider) => !FEDERAL_MANUAL_PROVIDER_SET.has(provider)),
  ];
}

export function effectiveProviderQuery(keywords?: string): string {
  return keywords?.trim() || DEFAULT_OCCUMED_QUERY;
}

function applyProviderGuards(
  provider: string,
  records: NormalizedOpportunity[],
  errors: string[],
  keywords?: string,
): ProviderRunResult {
  const query = effectiveProviderQuery(keywords);
  const partition = partitionProviderRecordsForQuery(records, query, 0);
  if (partition.rejectedCount > 0) {
    console.info(
      JSON.stringify({
        event: "rfp_provider_query_partitioned",
        provider,
        query,
        returned: partition.rawCount,
        matched: partition.matchedCount,
        rejected: partition.rejectedCount,
        retainedRejectionSamples: 0,
      }),
    );
  }

  const filtered = filterExpiredOpportunities(partition.matched);
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

async function applyStructuredFederalJudgePanel(
  provider: string,
  records: NormalizedOpportunity[],
  errors: string[],
  options: ProviderRunnerOptions,
): Promise<ProviderRunResult> {
  const guarded = applyProviderGuards(
    provider,
    records,
    errors,
    options.keywords,
  );
  if (guarded.records.length === 0) return guarded;

  const { judgeStructuredOpportunities } = await import(
    "../search/structuredOpportunityJudge"
  );
  const judged = await judgeStructuredOpportunities(guarded.records, {
    providerName: provider,
    signal: options.signal,
  });

  console.info(
    JSON.stringify({
      event: "rfp_structured_judge_panel",
      provider,
      candidates: guarded.records.length,
      approved: judged.approved.length,
      deterministicRejected: judged.deterministicRejected,
      panelRejected: judged.panelRejected,
      unjudged: judged.unjudged,
      deferred: judged.deferred,
      judges: judged.usedJudges,
      errors: judged.errors.length,
    }),
  );

  return {
    records: judged.approved,
    errors: [...guarded.errors, ...judged.errors],
    expiredSkipped: guarded.expiredSkipped,
  };
}

async function loadDiscoveryRuntime() {
  const [
    serper,
    exa,
    langsearch,
    parallel,
    linkup,
    you,
    socrata,
    websearch,
    firecrawl,
    intelligence,
  ] = await Promise.all([
    import("../providers/serper"),
    import("../providers/exa"),
    import("../providers/langsearch"),
    import("../providers/parallel"),
    import("../providers/linkup"),
    import("../providers/you"),
    import("../providers/socrata"),
    import("../providers/websearch"),
    import("../providers/firecrawl"),
    import("../search/webIntelligence"),
  ]);
  return {
    serperProvider: serper.serperProvider,
    exaProvider: exa.exaProvider,
    langsearchProvider: langsearch.langsearchProvider,
    parallelProvider: parallel.parallelProvider,
    linkupProvider: linkup.linkupProvider,
    youProvider: you.youProvider,
    socrataProvider: socrata.socrataProvider,
    websearchProvider: websearch.websearchProvider,
    firecrawlProvider: firecrawl.firecrawlProvider,
    webIntelligenceFetch: intelligence.webIntelligenceFetch,
  };
}

async function fetchConfiguredAiDiscovery(
  options: ProviderRunnerOptions,
): Promise<ProviderRunResult> {
  const runtime = await loadDiscoveryRuntime();
  const [
    useSerper,
    useExa,
    useLangsearch,
    useParallel,
    useLinkup,
    useYou,
    useSocrata,
    useWebsearch,
    useFirecrawl,
  ] = await Promise.all([
    runtime.serperProvider.isConfigured().catch(() => false),
    runtime.exaProvider.isConfigured().catch(() => false),
    runtime.langsearchProvider.isConfigured().catch(() => false),
    runtime.parallelProvider.isConfigured().catch(() => false),
    runtime.linkupProvider.isConfigured().catch(() => false),
    runtime.youProvider.isConfigured().catch(() => false),
    runtime.socrataProvider.isConfigured().catch(() => false),
    runtime.websearchProvider.isConfigured().catch(() => false),
    runtime.firecrawlProvider.isConfigured().catch(() => false),
  ]);
  if (
    !useSerper &&
    !useExa &&
    !useLangsearch &&
    !useParallel &&
    !useLinkup &&
    !useYou &&
    !useSocrata &&
    !useWebsearch
  ) {
    return {
      records: [],
      errors: [
        "AI Opportunity Discovery could not run because no supported search/discovery provider is configured.",
      ],
    };
  }

  const result = await runtime.webIntelligenceFetch({
    keywords: options.keywords,
    useSerper,
    useExa,
    useLangsearch,
    useParallel,
    useLinkup,
    useYou,
    useSocrata,
    useWebsearch,
    useFirecrawl,
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
      parallel: useParallel,
      linkup: useLinkup,
      you: useYou,
      socrata: useSocrata,
      websearch: useWebsearch,
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

  if (provider === "samGov") {
    const { samGovProvider } = await import("../providers/samGov");
    const result = await samGovProvider.fetch({
      keywords: options.keywords,
      dateRange: options.dateRange,
      limit: 100,
      signal: options.signal,
    });
    return applyStructuredFederalJudgePanel(
      provider,
      result.records,
      result.errors ?? [],
      options,
    );
  }

  if (provider === "tango") {
    const { tangoProvider } = await import("../providers/tango");
    const result = await tangoProvider.fetch({
      keywords: options.keywords,
      dateRange: options.dateRange,
      limit: 100,
      signal: options.signal,
    });
    return applyStructuredFederalJudgePanel(
      provider,
      result.records,
      result.errors ?? [],
      options,
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
