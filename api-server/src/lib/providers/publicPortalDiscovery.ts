import { createHash } from "crypto";
import type { NormalizedOpportunity } from "./types";
import { serperProvider } from "./serper";
import { extractMetadataFromText } from "../search/heuristicExtract";
import {
  ENRICHED_DIRECT_RFP_PORTALS,
  enrichedDirectRfpPortalsForOccuMedSearch,
  type EnrichedDirectRfpPortal,
} from "./directRfpPortalRelevanceCatalog";
import {
  parserForPortalSource,
  type PortalCandidateOpportunity,
} from "./portal-parsers";
import { buildOccuMedSearchQueries } from "../search/occumedProcurementOntology";
import { classifyResult } from "../search/relevance";
import type { PortalFit } from "./portalRelevance";

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;
const DEFAULT_EXECUTION_QUERY_BUDGET = 6;
const DEFAULT_RESULT_LIMIT = 25;
const MAX_DOMAINS_PER_QUERY = 6;
const MAX_DOMAIN_EXPRESSION_LENGTH = 1_250;
const UNKNOWN_POSTED_DATE = new Date(0);

type PortalGroup = "state" | "district";

export interface PublicPortalDiscoverySource {
  domain: string;
  name: string;
  state: string;
  tier: 1 | 2 | 3;
  group: PortalGroup;
  sourceId: string;
  searchUrl?: string;
  occumedFit: PortalFit;
  buyerSector: string;
  occumedServiceCategories: string[];
}

export interface PublicPortalPlannedQuery {
  query: string;
  portalIds: string[];
  domains: string[];
  queryBundleIndex: number;
  fitCounts: Record<string, number>;
}

export interface PublicPortalSearchPlanDiagnostics {
  eligiblePortalCount: number;
  selectedPortalCount: number;
  deferredPortalCount: number;
  selectedPortalIds: string[];
  deferredPortalIds: string[];
  queryBundleCount: number;
  selectedQueryCount: number;
  fullPlannedQueryCount: number;
  rotationKey: string;
  rotationOffset: number;
  countsByFitInCurrentExecution: Record<string, number>;
  countsByFitInCompletePlan: Record<string, number>;
}

export interface PublicPortalSearchPlan {
  selectedQueries: PublicPortalPlannedQuery[];
  allQueries: PublicPortalPlannedQuery[];
  diagnostics: PublicPortalSearchPlanDiagnostics;
}

function toPublicPortalDiscoverySource(portal: EnrichedDirectRfpPortal): PublicPortalDiscoverySource | null {
  if (portal.country !== "US") return null;
  if (portal.level !== "state" && portal.level !== "district") return null;
  return {
    domain: portal.domain,
    name: portal.name,
    state: portal.state ?? portal.jurisdiction,
    tier: portal.tier,
    group: portal.level === "district" ? "district" : "state",
    sourceId: portal.id,
    searchUrl: portal.searchUrl,
    occumedFit: portal.occumedFit,
    buyerSector: portal.buyerSector,
    occumedServiceCategories: portal.occumedServiceCategories,
  };
}

export const PUBLIC_PORTAL_DISCOVERY_SOURCES: PublicPortalDiscoverySource[] =
  enrichedDirectRfpPortalsForOccuMedSearch({ includeTier3: true })
    .map(toPublicPortalDiscoverySource)
    .filter((portal): portal is PublicPortalDiscoverySource => Boolean(portal));

function eligiblePortals(includeTier3 = true): PublicPortalDiscoverySource[] {
  return PUBLIC_PORTAL_DISCOVERY_SOURCES.filter((portal) => includeTier3 || portal.tier !== 3);
}

function hasStaleYearOnly(text: string): boolean {
  const years = Array.from(text.matchAll(/\b20\d{2}\b/g)).map((match) =>
    Number(match[0]),
  );
  if (years.length === 0) return false;
  const hasCurrentOrFuture = years.some(
    (year) => year >= CURRENT_YEAR && year <= NEXT_YEAR + 1,
  );
  const hasOld = years.some((year) => year < CURRENT_YEAR);
  return hasOld && !hasCurrentOrFuture;
}

function enrichedPortalByDomain(
  hostname: string,
): EnrichedDirectRfpPortal | undefined {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return ENRICHED_DIRECT_RFP_PORTALS.find((portal) =>
    normalized.includes(portal.domain.toLowerCase().replace(/^www\./, "")),
  );
}

function isOfficialDirectPortalResult(url: string): boolean {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`)
      .hostname;
    return Boolean(enrichedPortalByDomain(host));
  } catch {
    return false;
  }
}

function isUsefulPortalResult(
  title: string,
  url: string,
  snippet: string,
): boolean {
  if (!isOfficialDirectPortalResult(url)) return false;
  const raw = `${title} ${url} ${snippet}`;
  if (hasStaleYearOnly(raw)) return false;
  const classification = classifyResult({
    title,
    snippet,
    allowHistorical: false,
  });
  return !classification.rejected;
}

function countByFit(portals: PublicPortalDiscoverySource[]): Record<string, number> {
  return portals.reduce<Record<string, number>>((counts, portal) => {
    counts[portal.occumedFit] = (counts[portal.occumedFit] ?? 0) + 1;
    return counts;
  }, {});
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function defaultRotationKey(): string {
  return new Date().toISOString().slice(0, 13);
}

function buildDomainGroups(portals: PublicPortalDiscoverySource[]): PublicPortalDiscoverySource[][] {
  const groups: PublicPortalDiscoverySource[][] = [];
  let current: PublicPortalDiscoverySource[] = [];

  for (const portal of portals) {
    const candidate = [...current, portal];
    const expression = candidate
      .map((item) => `site:${item.domain}`)
      .join(" OR ");
    if (
      current.length > 0 &&
      (candidate.length > MAX_DOMAINS_PER_QUERY ||
        expression.length > MAX_DOMAIN_EXPRESSION_LENGTH)
    ) {
      groups.push(current);
      current = [portal];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function makePlannedQuery(
  portals: PublicPortalDiscoverySource[],
  queryBundle: string,
  queryBundleIndex: number,
  keywords?: string,
): PublicPortalPlannedQuery {
  const domainExpression = portals
    .map((portal) => `site:${portal.domain}`)
    .join(" OR ");
  const keywordSupplement = keywords?.trim()
    ? ` (${keywords.trim()})`
    : "";
  return {
    query: `(${domainExpression}) ${queryBundle}${keywordSupplement}`,
    portalIds: portals.map((portal) => portal.sourceId),
    domains: portals.map((portal) => portal.domain),
    queryBundleIndex,
    fitCounts: countByFit(portals),
  };
}

export function buildPublicPortalSearchPlan(
  options: {
    keywords?: string;
    includeTier3?: boolean;
    fullCoverage?: boolean;
    executionBudget?: number;
    rotationKey?: string;
  } = {},
): PublicPortalSearchPlan {
  const portals = eligiblePortals(options.includeTier3 ?? true);
  const domainGroups = buildDomainGroups(portals);
  const queryBundles = buildOccuMedSearchQueries(CURRENT_YEAR);
  const allQueries = domainGroups.flatMap((group) =>
    queryBundles.map((bundle, index) =>
      makePlannedQuery(group, bundle, index, options.keywords),
    ),
  );

  const rotationKey = options.rotationKey ?? defaultRotationKey();
  const rotationOffset =
    allQueries.length > 0 ? stableHash(rotationKey) % allQueries.length : 0;
  const rotated = [
    ...allQueries.slice(rotationOffset),
    ...allQueries.slice(0, rotationOffset),
  ];
  const executionBudget = Math.max(
    1,
    options.executionBudget ?? DEFAULT_EXECUTION_QUERY_BUDGET,
  );
  const selectedQueries = options.fullCoverage
    ? rotated
    : rotated.slice(0, executionBudget);
  const selectedPortalIds = unique(
    selectedQueries.flatMap((query) => query.portalIds),
  );
  const selectedSet = new Set(selectedPortalIds);
  const deferredPortalIds = portals
    .map((portal) => portal.sourceId)
    .filter((id) => !selectedSet.has(id));
  const selectedPortals = portals.filter((portal) =>
    selectedSet.has(portal.sourceId),
  );

  return {
    selectedQueries,
    allQueries,
    diagnostics: {
      eligiblePortalCount: portals.length,
      selectedPortalCount: selectedPortalIds.length,
      deferredPortalCount: deferredPortalIds.length,
      selectedPortalIds,
      deferredPortalIds,
      queryBundleCount: queryBundles.length,
      selectedQueryCount: selectedQueries.length,
      fullPlannedQueryCount: allQueries.length,
      rotationKey,
      rotationOffset,
      countsByFitInCurrentExecution: countByFit(selectedPortals),
      countsByFitInCompletePlan: countByFit(portals),
    },
  };
}

export function getPublicPortalSearchPlanDiagnostics(
  options: Parameters<typeof buildPublicPortalSearchPlan>[0] = {},
): PublicPortalSearchPlanDiagnostics {
  return buildPublicPortalSearchPlan(options).diagnostics;
}

function normalizeResultKey(title: string, url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`.toLowerCase();
  } catch {
    return `${title}|${url}`.toLowerCase();
  }
}

function resultToOpportunity(
  title: string,
  url: string,
  snippet: string,
  parsed?: PortalCandidateOpportunity,
): NormalizedOpportunity | null {
  if (!isUsefulPortalResult(title, url, snippet)) return null;

  const resultKey = normalizeResultKey(title, parsed?.sourceUrl ?? url);
  const urlHash = createHash("sha256").update(resultKey).digest("hex").slice(0, 20);
  const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(
    snippet,
    title,
  );
  const effectiveDeadline = parsed?.responseDeadline ?? deadline;
  if (effectiveDeadline && effectiveDeadline < new Date()) return null;

  const domainMatch = url.match(/https?:\/\/([^/]+)/);
  const directPortal = enrichedPortalByDomain(domainMatch?.[1] ?? "");
  const matchedPortal = eligiblePortals(true).find((portal) =>
    (domainMatch?.[1] ?? "")
      .toLowerCase()
      .includes(portal.domain.toLowerCase()),
  );
  const portalName =
    directPortal?.name ?? matchedPortal?.name ?? "Official Public RFP Portal";
  const portalState = directPortal?.state ?? matchedPortal?.state ?? "";
  const postedDate = parsed?.postedDate;

  return {
    externalId: `public-portal-${urlHash}`,
    title: parsed?.title ?? title,
    agency:
      parsed?.agency ??
      agencyHint ??
      (portalState
        ? `${portalState} Government`
        : (directPortal?.jurisdiction ?? "Unknown")),
    type: "Solicitation",
    status: "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline: effectiveDeadline ?? undefined,
    estimatedValue: estimatedValue ?? undefined,
    description: parsed?.description ?? snippet,
    solicitationNumber: parsed?.solicitationNumber,
    location: parsed?.location ?? parsed?.state,
    sourceUrl: parsed?.sourceUrl ?? url,
    source: "publicPortalProviders" as const,
    providerName: "publicPortalProviders",
    rawData: {
      providerName: "publicPortalProviders",
      providerFamily: "public_portal",
      providerType: "serper_official_portal_discovery",
      discoveryMethod: "serper_official_domain",
      portalName,
      portalState,
      portalGroup: matchedPortal?.group ?? directPortal?.level ?? "unknown",
      sourceId: directPortal?.id ?? matchedPortal?.sourceId,
      sourceConfidence: parsed ? "medium" : "low",
      occumedFit: directPortal?.occumedFit ?? matchedPortal?.occumedFit,
      buyerSector: directPortal?.buyerSector ?? matchedPortal?.buyerSector,
      occumedServiceCategories:
        directPortal?.occumedServiceCategories ??
        matchedPortal?.occumedServiceCategories ??
        [],
      dateUnknown: !postedDate,
      tags: [
        "official-procurement-portal",
        "serper-discovery",
        "verification-required",
        portalState ? `state:${portalState}` : "state:unknown",
        ...(!postedDate ? ["date-unknown"] : []),
      ],
      notes: `Search-discovered through Serper on the official portal domain for ${portalName}. This is not direct portal ingestion; verify the source page before relying on the card.`,
      parserApplied: Boolean(parsed),
      parsedPortalSourceId: parsed?.portalSourceId,
      fallback: true,
    },
  };
}

export class PublicPortalDiscovery {
  async isConfigured(): Promise<boolean> {
    return serperProvider.isConfigured();
  }

  async search(
    options: {
      keywords?: string;
      includeTier3?: boolean;
      fullCoverage?: boolean;
      executionBudget?: number;
      rotationKey?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<
    { title: string; url: string; snippet: string; portal: string }[]
  > {
    const plan = buildPublicPortalSearchPlan(options);
    if (plan.selectedQueries.length === 0) return [];

    const results = await serperProvider.searchMultiple(
      plan.selectedQueries.map((query) => query.query),
      10,
      { signal: options.signal },
    );
    const seen = new Set<string>();

    return results
      .map((result) => {
        const domainMatch = result.link.match(/https?:\/\/([^/]+)/);
        const directPortal = enrichedPortalByDomain(domainMatch?.[1] ?? "");
        return {
          title: result.title,
          url: result.link,
          snippet: result.snippet,
          portal: directPortal?.name ?? "Official Public RFP Portal",
        };
      })
      .filter((result) =>
        isUsefulPortalResult(result.title, result.url, result.snippet),
      )
      .filter((result) => {
        const key = normalizeResultKey(result.title, result.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, DEFAULT_RESULT_LIMIT);
  }

  toOpportunities(
    results: { title: string; url: string; snippet: string; portal: string }[],
  ): NormalizedOpportunity[] {
    return results
      .flatMap((result) => {
        const domainMatch = result.url.match(/https?:\/\/([^/]+)/);
        const directPortal = enrichedPortalByDomain(domainMatch?.[1] ?? "");
        const parser = parserForPortalSource(directPortal?.id);
        const parsed =
          parser?.({
            sourceId: directPortal?.id ?? "unknown",
            data: {
              title: result.title,
              url: result.url,
              summary: result.snippet,
            },
            baseUrl: directPortal?.searchUrl ?? directPortal?.url,
          }) ?? [];

        if (parsed.length === 0) {
          return [
            resultToOpportunity(result.title, result.url, result.snippet),
          ];
        }
        return parsed.map((candidate) =>
          resultToOpportunity(
            candidate.title ?? result.title,
            candidate.sourceUrl ?? result.url,
            candidate.description ?? result.snippet,
            candidate,
          ),
        );
      })
      .filter((opportunity): opportunity is NormalizedOpportunity =>
        Boolean(opportunity),
      );
  }
}

export const publicPortalDiscovery = new PublicPortalDiscovery();
