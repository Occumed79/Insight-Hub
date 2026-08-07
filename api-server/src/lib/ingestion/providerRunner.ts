import type {
  NormalizedOpportunity,
  ProviderProgressEvent,
} from "../providers/types";
import { partitionProviderRecordsForQuery } from "../providers/providerQueryMatch";
import { filterExpiredOpportunities } from "./opportunityExpiration";
import {
  providerBudgetAvailable,
  recordProviderFailure,
  recordProviderSuccess,
  selectBudgetedProviders,
} from "../providerBudget";

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
  ["rss_aggregator", "rssAggregator"],
  ["rssAggregator", "rssAggregator"],
]);

// Open-opportunity ingestion intentionally uses both structured federal pools.
// GovCon remains reserved for forecast/incumbent intelligence, where its data is
// differentiated and its limited allowance is more valuable.
export const FEDERAL_MANUAL_PROVIDERS = ["samGov", "tango"] as const;

export const MANUAL_RFP_PROVIDERS = new Set([
  ...FEDERAL_MANUAL_PROVIDERS,
  "aiDiscovery",
  "emailNotifications",
  "rssAggregator",
]);

const WEB_DISCOVERY_PROVIDERS = new Set(["serper", "exa", "langsearch"]);
const DEFAULT_OCCUMED_QUERY = "occupational health services";
const DEFAULT_MANUAL_PROVIDERS = ["samGov", "tango", "aiDiscovery"] as const;
const DISCOVERY_PROVIDER_ORDER = [
  "langsearch",
  "serper",
  "exa",
  "parallel",
  "linkup",
  "you",
  "socrata",
  "websearch",
] as const;
const MAX_DISCOVERY_ENSEMBLE = 3;

type StructuredFederalProvider = (typeof FEDERAL_MANUAL_PROVIDERS)[number];
type DiscoveryProvider = (typeof DISCOVERY_PROVIDER_ORDER)[number];

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

function isStructuredFederalProvider(
  provider: string,
): provider is StructuredFederalProvider {
  return provider === "samGov" || provider === "tango";
}

/**
 * Manual opportunity fetches default to the full search pool. If a user picks
 * either structured federal source, both SAM and Tango are retained so a weak
 * but non-empty response from one source can never suppress the other source.
 */
export function resolveManualProviders(providers?: string[]): string[] {
  const resolved = Array.from(
    new Set(
      (providers?.length ? providers : [...DEFAULT_MANUAL_PROVIDERS]).map(
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

  if (resolved.some(isStructuredFederalProvider)) {
    return [
      ...FEDERAL_MANUAL_PROVIDERS,
      ...resolved.filter((provider) => !isStructuredFederalProvider(provider)),
    ];
  }
  return resolved;
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

async function applyStructuredFederalDecision(
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

  const { decideStructuredOpportunities } = await import(
    "../search/structuredOpportunityDecision"
  );
  const decided = await decideStructuredOpportunities(guarded.records);

  if (decided.diagnostics.length > 0) {
    console.warn(
      JSON.stringify({
        event: "rfp_structured_review_recovered",
        provider,
        reviewer: decided.reviewer,
        diagnostics: decided.diagnostics,
      }),
    );
  }

  console.info(
    JSON.stringify({
      event: "rfp_structured_decision",
      provider,
      candidates: guarded.records.length,
      approved: decided.approved.length,
      deterministicApproved: decided.deterministicApproved,
      aiApproved: decided.aiApproved,
      rejected: decided.rejected,
      reviewHeld: decided.reviewHeld,
      reviewer: decided.reviewer,
    }),
  );

  return {
    records: decided.approved,
    errors: guarded.errors,
    expiredSkipped: guarded.expiredSkipped,
  };
}

async function recordStructuredProviderOutcome(
  provider: StructuredFederalProvider,
  rawRecordCount: number,
  upstreamErrors: string[],
  usefulRecordCount: number,
): Promise<void> {
  if (rawRecordCount === 0 && upstreamErrors.length > 0) {
    await recordProviderFailure(
      provider,
      new Error(upstreamErrors.join("; ")),
    );
    return;
  }
  await recordProviderSuccess(provider, usefulRecordCount);
}

async function fetchStructuredFederalProvider(
  provider: StructuredFederalProvider,
  options: ProviderRunnerOptions,
): Promise<ProviderRunResult> {
  if (!(await providerBudgetAvailable(provider))) {
    return {
      records: [],
      errors: [`${provider} is temporarily cooling down after an upstream quota or reliability failure.`],
    };
  }

  try {
    if (provider === "samGov") {
      const { samGovProvider } = await import("../providers/samGov");
      const result = await samGovProvider.fetch({
        keywords: options.keywords,
        dateRange: options.dateRange,
        limit: 100,
        signal: options.signal,
      });
      const upstreamErrors = result.errors ?? [];
      const decided = await applyStructuredFederalDecision(
        provider,
        result.records,
        upstreamErrors,
        options,
      );
      await recordStructuredProviderOutcome(
        provider,
        result.records.length,
        upstreamErrors,
        decided.records.length,
      );
      return decided;
    }

    const { tangoProvider } = await import("../providers/tango");
    const result = await tangoProvider.fetch({
      keywords: options.keywords,
      dateRange: options.dateRange,
      limit: 100,
      signal: options.signal,
    });
    const upstreamErrors = result.errors ?? [];
    const decided = await applyStructuredFederalDecision(
      provider,
      result.records,
      upstreamErrors,
      options,
    );
    await recordStructuredProviderOutcome(
      provider,
      result.records.length,
      upstreamErrors,
      decided.records.length,
    );
    return decided;
  } catch (error) {
    await recordProviderFailure(provider, error);
    throw error;
  }
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
    webIntelligenceFetch: intelligence.webIntelligenceFetch,
  };
}

function canonicalOpportunityKey(record: NormalizedOpportunity): string {
  const rawUrl = record.sourceUrl?.trim();
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
        url.searchParams.delete(key);
      }
      return `url:${url.toString().replace(/\/$/, "")}`;
    } catch {
      return `url:${rawUrl.replace(/\/$/, "")}`;
    }
  }
  return `id:${record.externalId}`;
}

function recordRelevance(record: NormalizedOpportunity): number {
  const score = Number(record.rawData?.relevanceScore);
  return Number.isFinite(score) ? score : 0;
}

function mergeDiscoveryRecords(
  records: NormalizedOpportunity[],
): NormalizedOpportunity[] {
  const best = new Map<string, NormalizedOpportunity>();
  for (const record of records) {
    const key = canonicalOpportunityKey(record);
    const existing = best.get(key);
    if (!existing || recordRelevance(record) > recordRelevance(existing)) {
      best.set(key, record);
    }
  }
  return [...best.values()];
}

function discoveryOptions(provider: DiscoveryProvider) {
  return {
    useSerper: provider === "serper",
    useExa: provider === "exa",
    useLangsearch: provider === "langsearch",
    useParallel: provider === "parallel",
    useLinkup: provider === "linkup",
    useYou: provider === "you",
    useSocrata: provider === "socrata",
    useWebsearch: provider === "websearch",
    // Do not silently re-enable self-hosted crawling/search inside each ensemble
    // member. Discovery here is API/browser-search based; URL enrichment still
    // has managed extraction fallbacks inside webIntelligence.
    useRssAggregator: false,
    useSelfHostedSearch: false,
    useSelfHostedCrawler: false,
    useFirecrawl: false,
  } as const;
}

async function fetchConfiguredAiDiscovery(
  options: ProviderRunnerOptions,
): Promise<ProviderRunResult> {
  const runtime = await loadDiscoveryRuntime();
  const configuredChecks: Record<DiscoveryProvider, () => Promise<boolean>> = {
    langsearch: () => runtime.langsearchProvider.isConfigured(),
    serper: () => runtime.serperProvider.isConfigured(),
    exa: () => runtime.exaProvider.isConfigured(),
    parallel: () => runtime.parallelProvider.isConfigured(),
    linkup: () => runtime.linkupProvider.isConfigured(),
    you: () => runtime.youProvider.isConfigured(),
    socrata: () => runtime.socrataProvider.isConfigured(),
    websearch: () => runtime.websearchProvider.isConfigured(),
  };

  const configured = (
    await Promise.all(
      DISCOVERY_PROVIDER_ORDER.map(async (provider) => ({
        provider,
        configured: await configuredChecks[provider]().catch(() => false),
      })),
    )
  )
    .filter((row) => row.configured)
    .map((row) => row.provider);

  if (configured.length === 0) {
    return {
      records: [],
      errors: [
        "AI Opportunity Discovery could not run because no supported browser/search provider is configured.",
      ],
    };
  }

  const selected = (await selectBudgetedProviders(
    configured,
    MAX_DISCOVERY_ENSEMBLE,
  )) as DiscoveryProvider[];
  if (selected.length === 0) {
    return {
      records: [],
      errors: [
        "Configured browser/search providers are temporarily cooling down after quota or upstream failures.",
      ],
    };
  }

  const settled = await Promise.allSettled(
    selected.map(async (provider) => {
      try {
        const result = await runtime.webIntelligenceFetch({
          keywords: options.keywords,
          signal: options.signal,
          ...discoveryOptions(provider),
        });
        if (result.opportunities.length > 0) {
          await recordProviderSuccess(provider, result.opportunities.length);
        } else if (result.errors.length > 0) {
          await recordProviderFailure(provider, result.errors.join("; "));
        } else {
          await recordProviderSuccess(provider, 0);
        }
        return { provider, result };
      } catch (error) {
        await recordProviderFailure(provider, error);
        throw error;
      }
    }),
  );

  const allRecords: NormalizedOpportunity[] = [];
  const errors: string[] = [];
  const diagnostics: Array<Record<string, unknown>> = [];

  settled.forEach((entry, index) => {
    const provider = selected[index]!;
    if (entry.status === "rejected") {
      errors.push(
        `${provider}: ${entry.reason instanceof Error ? entry.reason.message : String(entry.reason)}`,
      );
      diagnostics.push({ provider, status: "failed" });
      return;
    }
    allRecords.push(...entry.value.result.opportunities);
    diagnostics.push({
      provider,
      status: "ok",
      candidates: entry.value.result.stats.totalCandidates,
      accepted: entry.value.result.opportunities.length,
      aiScorers: entry.value.result.stats.aiScorers,
    });
  });

  const merged = mergeDiscoveryRecords(allRecords);
  console.info(
    JSON.stringify({
      event: "ai_opportunity_discovery_ensemble",
      query: options.keywords,
      configured,
      selected,
      memberRuns: diagnostics,
      acceptedBeforeDedupe: allRecords.length,
      acceptedAfterDedupe: merged.length,
      failures: errors.length,
    }),
  );

  // Recovered member failures are diagnostics when another discovery member
  // produced useful records; only surface them as terminal errors if the whole
  // ensemble failed to produce anything.
  return {
    records: merged,
    errors: merged.length > 0 ? [] : errors,
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

  if (provider === "rssAggregator") {
    const { rssAggregatorProvider } = await import("../providers/rssAggregator");
    const result = await rssAggregatorProvider.fetch({
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

  if (provider === "samGov" || provider === "tango") {
    return fetchStructuredFederalProvider(provider, options);
  }

  if (WEB_DISCOVERY_PROVIDERS.has(provider)) {
    const { webIntelligenceFetch } = await loadDiscoveryRuntime();
    const result = await webIntelligenceFetch({
      keywords: options.keywords,
      useSerper: provider === "serper",
      useExa: provider === "exa",
      useLangsearch: provider === "langsearch",
      useRssAggregator: false,
      useSelfHostedSearch: false,
      useSelfHostedCrawler: false,
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
  // starts. Importing it during API bootstrap instantiates every optional source.
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