import {
  ENRICHED_DIRECT_RFP_PORTALS,
  type EnrichedDirectRfpPortal,
} from "./directRfpPortalRelevanceCatalog";
import { serperProvider, type SerperSearchResult } from "./serper";
import { buildOccuMedSearchQueries } from "../search/occumedProcurementOntology";
import { classifyResult, hostFromUrl, type RelevanceResult } from "../search/relevance";
import type { PortalFit } from "./portalRelevance";

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_EXECUTION_BUDGET = 12;
const DEFAULT_RESULTS_PER_QUERY = 5;
const MAX_EXECUTION_BUDGET = 100;
const MAX_RESULTS_PER_QUERY = 10;

export interface PortalEvidencePlannedQuery {
  portalId: string;
  portalName: string;
  portalDomain: string;
  query: string;
  queryIndex: number;
  year: number;
}

export interface PortalEvidenceScanPlanDiagnostics {
  eligiblePortalCount: number;
  selectedPortalCount: number;
  deferredPortalCount: number;
  selectedPortalIds: string[];
  deferredPortalIds: string[];
  totalQueryCount: number;
  selectedQueryCount: number;
  rotationKey: string;
  rotationOffset: number;
  includeHistorical: boolean;
  years: number[];
}

export interface PortalEvidenceScanPlan {
  selectedQueries: PortalEvidencePlannedQuery[];
  allQueries: PortalEvidencePlannedQuery[];
  diagnostics: PortalEvidenceScanPlanDiagnostics;
}

export interface PortalEvidenceCandidate {
  portalId: string;
  portalName: string;
  title: string;
  url: string;
  snippet: string;
  date?: string;
  score: number;
  confidence: RelevanceResult["confidence"];
  primaryServiceCategory: string | null;
  matchedServiceCategories: string[];
  matchedExplicitPhrases: string[];
  matchedComponentTerms: string[];
  matchedRegulatorySignals: string[];
  matchedProcurementSignals: string[];
  reasonCodes: string[];
}

export interface PortalEvidenceRecommendation {
  portalId: string;
  portalName: string;
  currentFit: PortalFit;
  recommendedFit: PortalFit;
  candidateCount: number;
  matchedServiceCategories: string[];
  evidenceUrls: string[];
  candidates: PortalEvidenceCandidate[];
}

export interface PortalEvidenceScanResult {
  configured: boolean;
  plan: PortalEvidenceScanPlanDiagnostics;
  scannedPortalCount: number;
  evidenceCandidateCount: number;
  recommendations: PortalEvidenceRecommendation[];
  errors: string[];
}

export interface PortalEvidenceScanOptions {
  portalIds?: string[];
  includeTier3?: boolean;
  includeHistorical?: boolean;
  historicalYears?: number;
  fullCoverage?: boolean;
  executionBudget?: number;
  resultsPerQuery?: number;
  rotationKey?: string;
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

function normalizedDomain(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

export function isOfficialPortalEvidenceUrl(
  portal: Pick<EnrichedDirectRfpPortal, "domain">,
  url: string,
): boolean {
  const host = hostFromUrl(url);
  if (!host) return false;
  const portalDomain = normalizedDomain(portal.domain);
  const resultDomain = normalizedDomain(host);
  return (
    resultDomain === portalDomain ||
    resultDomain.endsWith(`.${portalDomain}`) ||
    portalDomain.endsWith(`.${resultDomain}`)
  );
}

function eligiblePortals(options: PortalEvidenceScanOptions): EnrichedDirectRfpPortal[] {
  const requested = new Set((options.portalIds ?? []).map((id) => id.trim()).filter(Boolean));
  return ENRICHED_DIRECT_RFP_PORTALS.filter(
    (portal) =>
      (options.includeTier3 !== false || portal.tier !== 3) &&
      portal.occumedFit !== "irrelevant" &&
      (requested.size === 0 || requested.has(portal.id)),
  );
}

function scanYears(options: PortalEvidenceScanOptions): number[] {
  if (!options.includeHistorical) return [CURRENT_YEAR];
  const historicalYears = Math.min(10, Math.max(1, options.historicalYears ?? 5));
  return Array.from({ length: historicalYears + 1 }, (_, index) => CURRENT_YEAR - index);
}

function buildPortalEvidenceQueries(
  portal: EnrichedDirectRfpPortal,
  years: number[],
): PortalEvidencePlannedQuery[] {
  return years.flatMap((year) =>
    buildOccuMedSearchQueries(year).map((query, queryIndex) => ({
      portalId: portal.id,
      portalName: portal.name,
      portalDomain: portal.domain,
      query: `site:${portal.domain} ${query}`,
      queryIndex,
      year,
    })),
  );
}

export function buildPortalEvidenceScanPlan(
  options: PortalEvidenceScanOptions = {},
): PortalEvidenceScanPlan {
  const portals = eligiblePortals(options);
  const years = scanYears(options);
  const allQueries = portals.flatMap((portal) =>
    buildPortalEvidenceQueries(portal, years),
  );
  const rotationKey = options.rotationKey ?? defaultRotationKey();
  const rotationOffset =
    allQueries.length > 0 ? stableHash(rotationKey) % allQueries.length : 0;
  const rotated = [
    ...allQueries.slice(rotationOffset),
    ...allQueries.slice(0, rotationOffset),
  ];
  const executionBudget = Math.min(
    MAX_EXECUTION_BUDGET,
    Math.max(1, options.executionBudget ?? DEFAULT_EXECUTION_BUDGET),
  );
  const selectedQueries = options.fullCoverage
    ? rotated
    : rotated.slice(0, executionBudget);
  const selectedPortalIds = unique(
    selectedQueries.map((query) => query.portalId),
  );
  const selectedSet = new Set(selectedPortalIds);
  const allPortalIds = portals.map((portal) => portal.id);
  const deferredPortalIds = allPortalIds.filter((id) => !selectedSet.has(id));

  return {
    selectedQueries,
    allQueries,
    diagnostics: {
      eligiblePortalCount: portals.length,
      selectedPortalCount: selectedPortalIds.length,
      deferredPortalCount: deferredPortalIds.length,
      selectedPortalIds,
      deferredPortalIds,
      totalQueryCount: allQueries.length,
      selectedQueryCount: selectedQueries.length,
      rotationKey,
      rotationOffset,
      includeHistorical: options.includeHistorical === true,
      years,
    },
  };
}

export function classifyPortalEvidenceResult(
  portal: EnrichedDirectRfpPortal,
  result: SerperSearchResult,
): PortalEvidenceCandidate | null {
  if (!result.link || !isOfficialPortalEvidenceUrl(portal, result.link)) return null;
  const classification = classifyResult({
    title: result.title,
    snippet: result.snippet,
    url: result.link,
    date: result.date,
    allowHistorical: true,
  });
  if (classification.rejected) return null;
  if (
    classification.matchedServiceCategories.length === 0 ||
    classification.matchedProcurementSignals.length === 0
  ) {
    return null;
  }

  return {
    portalId: portal.id,
    portalName: portal.name,
    title: result.title,
    url: result.link,
    snippet: result.snippet,
    date: result.date,
    score: classification.score,
    confidence: classification.confidence,
    primaryServiceCategory: classification.primaryServiceCategory,
    matchedServiceCategories: classification.matchedServiceCategories,
    matchedExplicitPhrases: classification.matchedExplicitPhrases,
    matchedComponentTerms: classification.matchedComponentTerms,
    matchedRegulatorySignals: classification.matchedRegulatorySignals,
    matchedProcurementSignals: classification.matchedProcurementSignals,
    reasonCodes: classification.reasonCodes,
  };
}

function recommendationForPortal(
  portal: EnrichedDirectRfpPortal,
  candidates: PortalEvidenceCandidate[],
): PortalEvidenceRecommendation {
  const deduped = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return {
    portalId: portal.id,
    portalName: portal.name,
    currentFit: portal.occumedFit,
    recommendedFit: deduped.length > 0 ? "verified_high" : portal.occumedFit,
    candidateCount: deduped.length,
    matchedServiceCategories: unique(
      deduped.flatMap((candidate) => candidate.matchedServiceCategories),
    ),
    evidenceUrls: deduped.map((candidate) => candidate.url),
    candidates: deduped,
  };
}

export async function scanPortalEvidence(
  options: PortalEvidenceScanOptions = {},
): Promise<PortalEvidenceScanResult> {
  const configured = await serperProvider.isConfigured();
  const plan = buildPortalEvidenceScanPlan(options);
  if (!configured) {
    return {
      configured: false,
      plan: plan.diagnostics,
      scannedPortalCount: 0,
      evidenceCandidateCount: 0,
      recommendations: [],
      errors: ["Serper API key not configured; portal evidence scanning is disabled."],
    };
  }

  const resultsPerQuery = Math.min(
    MAX_RESULTS_PER_QUERY,
    Math.max(1, options.resultsPerQuery ?? DEFAULT_RESULTS_PER_QUERY),
  );
  const portalById = new Map(
    ENRICHED_DIRECT_RFP_PORTALS.map((portal) => [portal.id, portal]),
  );
  const errors: string[] = [];
  const candidateMap = new Map<string, PortalEvidenceCandidate[]>();

  await Promise.all(
    plan.selectedQueries.map(async (planned) => {
      const portal = portalById.get(planned.portalId);
      if (!portal) return;
      try {
        const results = await serperProvider.search(planned.query, resultsPerQuery);
        for (const result of results) {
          const candidate = classifyPortalEvidenceResult(portal, result);
          if (!candidate) continue;
          const existing = candidateMap.get(portal.id) ?? [];
          existing.push(candidate);
          candidateMap.set(portal.id, existing);
        }
      } catch (error) {
        errors.push(
          `${planned.portalId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  const scannedPortalIds = unique(
    plan.selectedQueries.map((query) => query.portalId),
  );
  const recommendations = scannedPortalIds
    .map((portalId) => {
      const portal = portalById.get(portalId);
      return portal
        ? recommendationForPortal(portal, candidateMap.get(portalId) ?? [])
        : null;
    })
    .filter(
      (recommendation): recommendation is PortalEvidenceRecommendation =>
        recommendation !== null,
    )
    .sort(
      (a, b) =>
        b.candidateCount - a.candidateCount ||
        a.portalName.localeCompare(b.portalName),
    );

  return {
    configured: true,
    plan: plan.diagnostics,
    scannedPortalCount: scannedPortalIds.length,
    evidenceCandidateCount: recommendations.reduce(
      (total, recommendation) => total + recommendation.candidateCount,
      0,
    ),
    recommendations,
    errors,
  };
}
