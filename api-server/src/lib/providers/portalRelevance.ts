import { REASON_CODES } from "../search/occumedProcurementOntology";
import { classifyResult } from "../search/relevance";
import { decideRelevance } from "../search/relevanceDecision";
import { getRelevanceProfile } from "../search/relevanceProfile";

export type PortalFit =
  | "verified_high"
  | "likely"
  | "broad"
  | "insufficient_evidence"
  | "irrelevant";

export interface PortalRelevanceInput {
  id?: string;
  name?: string;
  jurisdiction?: string;
  buyerEntityName?: string;
  state?: string;
  country?: string;
  level?: string;
  notes?: string;
  officialPageText?: string;
  sampledPageText?: string;
  currentSolicitationTitles?: string[];
  archivedSolicitationTitles?: string[];
  procurementCategoryText?: string;
  knownHistoricalMatchingSolicitations?: string[];
  entityBuyerSector?: string;
  evidenceUrls?: string[];
  isOfficialPortal?: boolean;
  isAggregatorMarketplace?: boolean;
  lastVerifiedDate?: string;
}

export interface PortalRelevanceResult {
  score: number;
  fit: PortalFit;
  likelyServiceCategories: string[];
  matchedTerms: string[];
  buyerSectorSignals: string[];
  matchingOpportunityCount: number;
  evidenceReasons: string[];
  evidenceUrls: string[];
  lastVerifiedDate: string;
}

function norm(s: string | undefined | null): string {
  return ` ${(s ?? "").toLowerCase()} `;
}
function uniq<T>(a: T[]): T[] {
  return Array.from(new Set(a));
}
/** Leading word boundary only, so "ems" does not match inside "systems" but plurals still match. */
function mentions(text: string, phrase: string): boolean {
  const p = phrase.toLowerCase().trim();
  if (!p) return false;
  let from = 0;
  for (;;) {
    const at = text.indexOf(p, from);
    if (at < 0) return false;
    if (at === 0 || !/[a-z0-9]/.test(text[at - 1]!)) return true;
    from = at + 1;
  }
}
/** Buyer-sector signals come from the profile (rows with a high/medium propensity); prime-contractor names are not portal buyers. */
const PORTAL_BUYER_PROPENSITIES = new Set(["high", "medium"]);

export function scorePortalForOccuMed(
  input: PortalRelevanceInput,
): PortalRelevanceResult {
  const today = new Date().toISOString().slice(0, 10);
  if (input.isAggregatorMarketplace) {
    return {
      score: 0,
      fit: "irrelevant",
      likelyServiceCategories: [],
      matchedTerms: [],
      buyerSectorSignals: [],
      matchingOpportunityCount: 0,
      evidenceReasons: [
        "Aggregator/search marketplace is not a direct official portal",
      ],
      evidenceUrls: input.evidenceUrls ?? [],
      lastVerifiedDate: input.lastVerifiedDate ?? today,
    };
  }
  const texts = [
    input.officialPageText,
    input.sampledPageText,
    input.procurementCategoryText,
    input.notes,
    ...(input.currentSolicitationTitles ?? []),
    ...(input.archivedSolicitationTitles ?? []),
    ...(input.knownHistoricalMatchingSolicitations ?? []),
  ];
  const combined = texts.filter(Boolean).join(". ");
  const opportunityEvidence = [
    ...(input.currentSolicitationTitles ?? []),
    ...(input.archivedSolicitationTitles ?? []),
    ...(input.knownHistoricalMatchingSolicitations ?? []),
  ];
  const classified = opportunityEvidence.map((title) =>
    classifyResult({
      title,
      snippet: `${input.officialPageText ?? ""} ${input.sampledPageText ?? ""}`,
      allowHistorical: true,
    }),
  );
  const matches = classified.filter((r) => decideRelevance(r).verdict !== "reject");
  const serviceCategories = uniq(
    matches.flatMap((m) => m.matchedServiceCategories),
  );
  const matchedTerms = uniq(
    matches.flatMap((m) => [
      ...m.matchedExplicitPhrases,
      ...m.matchedComponentTerms,
      ...m.matchedRegulatorySignals,
    ]),
  );
  const buyerText = norm(
    [
      input.name,
      input.jurisdiction,
      input.buyerEntityName,
      input.entityBuyerSector,
      input.notes,
      input.officialPageText,
      input.sampledPageText,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const profile = getRelevanceProfile();
  const buyerSectorSignals = profile.buyerSectors
    .filter((b) => b.propensity !== null && PORTAL_BUYER_PROPENSITIES.has(b.propensity) && mentions(buyerText, b.phrase))
    .map((b) => `${b.propensity}:${b.phrase}`);
  const officialProcurementEvidence =
    input.isOfficialPortal !== false &&
    /\b(procurement|purchasing|solicitation|bid|rfp|contract|vendor)\b/i.test(
      combined,
    );
  if (
    matches.length > 0 &&
    (input.evidenceUrls?.length || officialProcurementEvidence)
  ) {
    return {
      score: Math.min(100, 82 + Math.min(15, matches.length * 4)),
      fit: "verified_high",
      likelyServiceCategories: serviceCategories,
      matchedTerms,
      buyerSectorSignals: uniq(buyerSectorSignals),
      matchingOpportunityCount: matches.length,
      evidenceReasons: [
        REASON_CODES.portalVerified,
        "Official portal evidence includes current/historical Occu-Med-relevant procurement",
      ],
      evidenceUrls: input.evidenceUrls ?? [],
      lastVerifiedDate: input.lastVerifiedDate ?? today,
    };
  }
  const highBuyer = buyerSectorSignals.some((s) => s.startsWith("high:"));
  if (officialProcurementEvidence && highBuyer) {
    const categoryHints = profile.categories
      .filter((c) => [...c.explicit, ...c.component].some((t) => mentions(buyerText, t)))
      .map((c) => c.label);
    return {
      score: 68,
      fit: "likely",
      likelyServiceCategories: uniq(categoryHints),
      matchedTerms: [],
      buyerSectorSignals: uniq(buyerSectorSignals),
      matchingOpportunityCount: 0,
      evidenceReasons: [
        REASON_CODES.portalLikely,
        "High-propensity buyer with official procurement/organizational evidence but no direct matching solicitation",
      ],
      evidenceUrls: input.evidenceUrls ?? [],
      lastVerifiedDate: input.lastVerifiedDate ?? today,
    };
  }
  if (officialProcurementEvidence)
    return {
      score: 40,
      fit: "broad",
      likelyServiceCategories: [],
      matchedTerms: [],
      buyerSectorSignals: uniq(buyerSectorSignals),
      matchingOpportunityCount: 0,
      evidenceReasons: [
        "Official broad procurement coverage without Occu-Med-specific evidence",
      ],
      evidenceUrls: input.evidenceUrls ?? [],
      lastVerifiedDate: input.lastVerifiedDate ?? today,
    };
  return {
    score: 20,
    fit: "insufficient_evidence",
    likelyServiceCategories: [],
    matchedTerms: [],
    buyerSectorSignals: uniq(buyerSectorSignals),
    matchingOpportunityCount: 0,
    evidenceReasons: [
      "Insufficient procurement history or buyer-sector evidence",
    ],
    evidenceUrls: input.evidenceUrls ?? [],
    lastVerifiedDate: input.lastVerifiedDate ?? today,
  };
}
