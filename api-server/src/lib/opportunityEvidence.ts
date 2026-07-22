import type { NormalizedOpportunity } from "./providers/types";
import {
  deadlineEndForComparison,
  isLikelySnippet,
} from "./opportunityQuality";

export type OpportunityEvidenceType =
  | "direct-structured"
  | "authoritative-page"
  | "discovery"
  | "aggregator"
  | "landing-page";

export type EvidenceProvenance =
  | "official_structured"
  | "authoritative_page"
  | "search_snippet"
  | "heuristic"
  | "unknown";

export type EvidenceAuthority = "trusted" | "medium" | "low";

export interface OpportunityEvidenceProfile {
  providerId: string;
  evidenceType: OpportunityEvidenceType;
  sourceAuthority: EvidenceAuthority;
  sourceConfidence: "high" | "medium" | "low";
  buyerProvenance: EvidenceProvenance;
  deadlineProvenance: EvidenceProvenance;
  statusProvenance: EvidenceProvenance;
  descriptionProvenance: EvidenceProvenance;
  directSolicitationUrl: boolean;
  completeDirectEvidence: boolean;
  strength: number;
  tags: string[];
  notes: string;
}

export const ADAPTER_EVIDENCE_CLASS: Record<string, OpportunityEvidenceType> = {
  samGov: "direct-structured",
  sam_gov: "direct-structured",
  texasEsbd: "direct-structured",
  nyScr: "direct-structured",
  eunaBonfire: "direct-structured",
  openGov: "direct-structured",
  opengov: "direct-structured",
  bonfire: "direct-structured",
  bonfire_euna: "direct-structured",
  jaggaerSciQuest: "direct-structured",
  jaggaer_sciquest: "direct-structured",
  ionWave: "direct-structured",
  ionwave_euna: "direct-structured",
  bso: "direct-structured",
  bsoPortal: "direct-structured",
  bidExpress: "direct-structured",
  publicPurchase: "direct-structured",
  cgiAdvantagePublic: "direct-structured",
  calEprocure: "direct-structured",
  cal_eprocure_peoplesoft: "direct-structured",
  oregonBuys: "direct-structured",
  oregonbuys_bso: "direct-structured",
  minnesotaOsp: "direct-structured",
  hawaiiHands: "direct-structured",
  southDakotaPostingBoard: "direct-structured",
  civicEngageBids: "authoritative-page",
  civicengage_bids: "authoritative-page",
  publicPortalProviders: "authoritative-page",
  statePortals: "authoritative-page",
  internationalPublicPortals: "authoritative-page",
  serper: "discovery",
  exa: "discovery",
  tavily: "discovery",
  you: "discovery",
  langsearch: "discovery",
  websearch: "discovery",
};

const GENERIC_BUYER_RE =
  /^(unknown|unknown organization|government|government agency|state agency|official public rfp portal|procurement portal|occupational health|drug & alcohol screening|medical surveillance)$/i;
const AGGREGATOR_HOSTS =
  /highergov\.com|govtribe\.com|starbridge\.ai|rfpmart\.com|sweetspotgov\.com|fedscout\.com|bidbanana\.thebidlab\.com|tenderimpulse\.com|demandstar\.com/i;
const LANDING_RE =
  /procurement opportunities|bids?\s*(?:&|and)\s*rfps?|bid opportunities|all-tender-list|page \d+ of \d+|procurements:/i;
const DIRECT_URL_RE =
  /\/opp\/[^/]+\/view|biddetail|solicitations?\/details?|opportunit(?:y|ies)\/[^/?#]+|events?\/[^/?#]+|bids?\/[^/?#]+|rfps?\/[^/?#]+|[?&](?:bid|event|solicitation|opportunity)(?:id|no|number)?=/i;
const DISCOVERY_METHOD_RE = /serper|search|discovery|snippet/i;
const DIRECT_METHOD_RE =
  /dedicated_official_adapter|direct_official_listing|structured_official/i;

function evidenceValue(value: unknown): OpportunityEvidenceType | null {
  return value === "direct-structured" ||
    value === "authoritative-page" ||
    value === "discovery" ||
    value === "aggregator" ||
    value === "landing-page"
    ? value
    : null;
}

function providerEvidenceType(
  record: NormalizedOpportunity,
): OpportunityEvidenceType {
  const raw = record.rawData ?? {};
  const url = record.sourceUrl ?? "";
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String).join(" ") : "";
  const discoveryMethod = String(raw.discoveryMethod ?? raw.providerType ?? "");

  if (AGGREGATOR_HOSTS.test(url)) return "aggregator";
  if (
    raw.fallback === true ||
    raw.serperFallback === true ||
    DISCOVERY_METHOD_RE.test(discoveryMethod) ||
    /serper-discovery|verification-required|ai-pending/i.test(tags)
  ) {
    return "discovery";
  }

  const explicit = evidenceValue(raw.evidenceType ?? raw.sourceEvidenceType);
  if (explicit) return explicit;
  if (LANDING_RE.test(`${record.title} ${url}`)) return "landing-page";
  if (DIRECT_METHOD_RE.test(discoveryMethod)) return "direct-structured";

  const platform = String(raw.providerPlatform ?? raw.adapterId ?? "");
  return (
    ADAPTER_EVIDENCE_CLASS[platform] ??
    ADAPTER_EVIDENCE_CLASS[record.source] ??
    "discovery"
  );
}

function provenance(
  raw: Record<string, unknown>,
  key: string,
  fallback: EvidenceProvenance,
): EvidenceProvenance {
  const value = raw[key];
  return value === "official_structured" ||
    value === "authoritative_page" ||
    value === "search_snippet" ||
    value === "heuristic" ||
    value === "unknown"
    ? value
    : fallback;
}

function hasDirectSolicitationUrl(
  record: NormalizedOpportunity,
  evidenceType: OpportunityEvidenceType,
): boolean {
  const raw = record.rawData ?? {};
  const url = record.sourceUrl ?? "";
  if (!url || LANDING_RE.test(url)) return false;
  if (
    typeof raw.nativeOpportunityId === "string" &&
    raw.nativeOpportunityId.trim()
  )
    return true;
  if (evidenceType === "direct-structured" && record.externalId?.trim())
    return true;
  return DIRECT_URL_RE.test(url);
}

function providerId(record: NormalizedOpportunity): string {
  const raw = record.rawData ?? {};
  return String(
    raw.providerPlatform ??
      raw.adapterId ??
      raw.sourceId ??
      raw.providerName ??
      record.providerName ??
      record.source,
  );
}

export function normalizeOpportunityEvidence(
  record: NormalizedOpportunity,
  now = new Date(),
): OpportunityEvidenceProfile {
  const raw = record.rawData ?? {};
  const evidenceType = providerEvidenceType(record);
  const structured = evidenceType === "direct-structured";
  const authoritativePage = evidenceType === "authoritative-page";
  const officialEvidence = structured || authoritativePage;
  const defaultOfficialProvenance: EvidenceProvenance = structured
    ? "official_structured"
    : authoritativePage
      ? "authoritative_page"
      : evidenceType === "discovery"
        ? "search_snippet"
        : "unknown";
  const buyerKnown = Boolean(
    record.agency?.trim() && !GENERIC_BUYER_RE.test(record.agency.trim()),
  );
  const deadline = deadlineEndForComparison(record.responseDeadline);
  const futureDeadline = Boolean(
    deadline && deadline.getTime() > now.getTime(),
  );
  const directUrl = hasDirectSolicitationUrl(record, evidenceType);
  const buyerProvenance = provenance(
    raw,
    "buyerProvenance",
    buyerKnown ? defaultOfficialProvenance : "unknown",
  );
  const deadlineProvenance = provenance(
    raw,
    "deadlineProvenance",
    record.responseDeadline ? defaultOfficialProvenance : "unknown",
  );
  const statusProvenance = provenance(
    raw,
    "statusProvenance",
    defaultOfficialProvenance,
  );
  const descriptionProvenance = provenance(
    raw,
    "descriptionProvenance",
    record.description ? defaultOfficialProvenance : "unknown",
  );
  const provenanceMatchesEvidence = structured
    ? buyerProvenance === "official_structured" &&
      deadlineProvenance === "official_structured" &&
      statusProvenance === "official_structured"
    : authoritativePage
      ? buyerProvenance === "authoritative_page" &&
        deadlineProvenance === "authoritative_page" &&
        statusProvenance === "authoritative_page" &&
        descriptionProvenance === "authoritative_page" &&
        !isLikelySnippet(record.description)
      : false;
  const completeDirectEvidence = Boolean(
    officialEvidence &&
    provenanceMatchesEvidence &&
    directUrl &&
    buyerKnown &&
    record.title?.trim() &&
    record.type?.trim() &&
    record.status === "active" &&
    futureDeadline,
  );
  const sourceAuthority: EvidenceAuthority = officialEvidence
    ? "trusted"
    : evidenceType === "aggregator"
      ? "medium"
      : "low";
  const sourceConfidence: "high" | "medium" | "low" = completeDirectEvidence
    ? structured
      ? "high"
      : "medium"
    : "low";
  const strength =
    evidenceType === "direct-structured"
      ? 5
      : evidenceType === "authoritative-page"
        ? 4
        : evidenceType === "landing-page"
          ? 3
          : evidenceType === "aggregator"
            ? 2
            : 1;
  const tags = [
    `evidence:${evidenceType}`,
    `authority:${sourceAuthority}`,
    `buyer:${buyerProvenance}`,
    `deadline:${deadlineProvenance}`,
    `status:${statusProvenance}`,
    `description:${descriptionProvenance}`,
    directUrl ? "direct-solicitation-url" : "landing-or-search-url",
    ...(completeDirectEvidence ? ["complete-direct-evidence"] : []),
  ];

  return {
    providerId: providerId(record),
    evidenceType,
    sourceAuthority,
    sourceConfidence,
    buyerProvenance,
    deadlineProvenance,
    statusProvenance,
    descriptionProvenance,
    directSolicitationUrl: directUrl,
    completeDirectEvidence,
    strength,
    tags,
    notes: `Evidence ${evidenceType}; adapter=${providerId(record)}; buyer=${buyerProvenance}; deadline=${deadlineProvenance}; status=${statusProvenance}; description=${descriptionProvenance}; directUrl=${directUrl}`,
  };
}

export function evidenceStrengthFromStored(value: {
  tags?: unknown;
  providerName?: string | null;
  providerKey?: string | null;
  source?: string | null;
}): number {
  const rawTags = Array.isArray(value.tags)
    ? value.tags.join(" ")
    : String(value.tags ?? "");
  if (/evidence:direct-structured/.test(rawTags)) return 5;
  if (/evidence:authoritative-page/.test(rawTags)) return 4;
  if (/evidence:landing-page/.test(rawTags)) return 3;
  if (/evidence:aggregator/.test(rawTags)) return 2;
  if (/evidence:discovery/.test(rawTags)) return 1;
  const provider = String(
    value.providerKey ?? value.providerName ?? value.source ?? "",
  );
  const mapped = ADAPTER_EVIDENCE_CLASS[provider];
  return mapped === "direct-structured"
    ? 5
    : mapped === "authoritative-page"
      ? 4
      : mapped === "landing-page"
        ? 3
        : mapped === "aggregator"
          ? 2
          : 1;
}
