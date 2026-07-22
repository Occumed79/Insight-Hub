import { createHash } from "node:crypto";

export type OpportunityQualityClassification =
  | "verified-open"
  | "needs-verification"
  | "closed"
  | "archived"
  | "award"
  | "forecast"
  | "discovery-only";

export type OpportunityViewMode = "actionable" | "needs-verification" | "closed" | "all";

export interface OpportunityQualityView {
  classification: OpportunityQualityClassification;
  label: string;
  actionable: boolean;
  summaryEligible: boolean;
  sourceType: "official-direct" | "verified-solicitation-page" | "search-discovery" | "aggregator" | "unknown";
  reasons: string[];
  hasFutureDeadline: boolean;
  deadlineKnown: boolean;
  buyerKnown: boolean;
  solicitationLike: boolean;
  sourceVerified: boolean;
  sourceAuthority: "trusted" | "medium" | "low";
  evidenceFingerprint: string;
}

type OpportunityLike = Record<string, any>;

const DISCOVERY_PROVIDERS = new Set(["serper", "exa", "tavily", "you", "langsearch", "websearch"]);
const TRUSTED_PROVIDERS = new Set([
  "samGov",
  "sam_gov",
  "publicPortalProviders",
  "statePortals",
  "eunaBonfire",
  "internationalPublicPortals",
  "tango",
  "bidnet",
  "texasEsbd",
  "nyScr",
]);
const AGGREGATOR_HOSTS = [
  "highergov.com",
  "govtribe.com",
  "starbridge.ai",
  "rfpmart.com",
  "sweetspotgov.com",
  "fedscout.com",
  "bidbanana.thebidlab.com",
  "tenderimpulse.com",
  "demandstar.com",
];
const OFFICIAL_HOST_HINTS = [".gov", ".mil", "sam.gov", "combuys.com", "oregonbuys.gov", "bidbuy.illinois.gov", "evp.nc.gov"];
const BAD_TYPE_RE = /award notice|notice of award|forecast|tabulation|bid tab|purchase order|contract document|contract pdf|archive|archived|cancel|intent to award|sole source/i;
const FORECAST_RE = /forecast|acquisition planning forecast|apfs/i;
const AWARD_RE = /\b(award notice|notice of award|notice of intent to award|intent to award|contract award(?:ed)?|bid result|bid tabulation|tabulation of bids|purchase order|contract document|contract\.pdf|contract pdf|awarded to)\b/i;
const GENERAL_PAGE_RE = /procurement opportunities|bids & rfps|bid opportunities|solicitation 2026|all-tender-list|page \d+ of \d+|procurements:/i;
const SOLICITATION_RE = /solicitation|request for proposal|\brfp\b|invitation to bid|\bitb\b|request for quote|\brfq\b|bid solicitation|sources sought|presolicitation|tender/i;

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }
}

function urlHost(value: unknown): string {
  try {
    return new URL(String(value ?? "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function canonicalSamOpportunityUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const match = url.pathname.match(/(?:\/workspace\/contract\/opp|\/opp)\/([^/]+)\/view/i);
    if (/sam\.gov$/i.test(url.hostname) && match?.[1]) return `https://sam.gov/opp/${match[1]}/view`;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function deadlineEndForComparison(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const raw = String(value instanceof Date ? value.toISOString() : value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}(?:T00:00:00\.000Z)?$/.test(raw);
  if (dateOnly || (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0)) {
    const [year, month, day] = date.toISOString().slice(0, 10).split("-").map(Number);
    // End of the application calendar day in America/Los_Angeles. Noon UTC
    // avoids DST boundary ambiguity, then Intl reveals the active PDT/PST offset.
    const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
    const tzName = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset" }).formatToParts(noonUtc).find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
    const offsetHours = Number(tzName.match(/GMT([+-]\d+)/)?.[1] ?? -8);
    return new Date(Date.UTC(year, month - 1, day + 1, -offsetHours, 0, 0, -1));
  }
  return date;
}

export function classifyOpportunityQuality(opp: OpportunityLike, now = new Date()): OpportunityQualityView {
  const tags = parseTags(opp.tags).map((t) => t.toLowerCase());
  const provider = String(opp.providerName ?? opp.providerKey ?? opp.source ?? "");
  const url = String(opp.samUrl ?? opp.sourceUrl ?? opp.url ?? "");
  const host = urlHost(url);
  const identityText = [opp.title, opp.type, url].filter(Boolean).join(" ");
  const fullText = [identityText, opp.agency, opp.description, opp.notes, tags.join(" ")].filter(Boolean).join(" ");
  const deadline = deadlineEndForComparison(opp.responseDeadline);
  const deadlineKnown = Boolean(deadline);
  const hasFutureDeadline = Boolean(deadline && deadline.getTime() > now.getTime());
  const buyer = String(opp.agency ?? "").trim();
  const buyerKnown = buyer.length > 0 && !/^(unknown|unknown organization|occupational health|drug & alcohol screening|medical surveillance|government)$/i.test(buyer);
  const sourceConfidence = String(opp.sourceConfidence ?? "").toLowerCase();
  const confidenceOk = sourceConfidence === "high" || sourceConfidence === "medium" || (!sourceConfidence && TRUSTED_PROVIDERS.has(provider));
  const aggregator = AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  const discoveryProvider = DISCOVERY_PROVIDERS.has(provider) || tags.includes("ai-pending");
  const officialHost = OFFICIAL_HOST_HINTS.some((h) => host === h.replace(/^\./, "") || host.endsWith(h));
  const trustedProvider = TRUSTED_PROVIDERS.has(provider);
  const sourceVerified = (trustedProvider || officialHost) && !discoveryProvider && !aggregator;
  const sourceType = discoveryProvider ? "search-discovery" : aggregator ? "aggregator" : trustedProvider ? "official-direct" : officialHost ? "verified-solicitation-page" : "unknown";
  const awardLike = AWARD_RE.test(identityText) || /\bawarded to\b/i.test(String(opp.description ?? ""));
  const forecastLike = FORECAST_RE.test(identityText);
  const solicitationLike = SOLICITATION_RE.test(fullText) && !BAD_TYPE_RE.test(identityText) && !GENERAL_PAGE_RE.test(identityText);
  const structuredDirectEvidence = trustedProvider && Boolean(buyerKnown && opp.title && opp.type && String(opp.status).toLowerCase() === "active" && opp.postedDate && deadlineKnown && url);
  const reasons: string[] = [];

  let classification: OpportunityQualityClassification;
  if (String(opp.status).toLowerCase() === "archived") classification = "archived";
  else if (awardLike) classification = "award";
  else if (forecastLike) classification = "forecast";
  else if (deadlineKnown && !hasFutureDeadline) classification = "closed";
  else if (discoveryProvider || aggregator || GENERAL_PAGE_RE.test(identityText)) classification = "discovery-only";
  else if (!deadlineKnown || !sourceVerified || !buyerKnown || !solicitationLike || !confidenceOk) classification = "needs-verification";
  else classification = "verified-open";

  if (!deadlineKnown) reasons.push("A future submission deadline could not be confirmed.");
  else if (!hasFutureDeadline) reasons.push("The stored submission deadline has passed.");
  if (!sourceVerified) reasons.push("Authoritative solicitation content has not been verified.");
  if (!buyerKnown) reasons.push("Buyer identity is missing or generic.");
  if (!solicitationLike) reasons.push("The record is not clearly an actionable solicitation.");
  if (classification === "award") reasons.push("The record appears to be an award, purchase order, tabulation, or contract document.");
  if (classification === "forecast") reasons.push("The record appears to be a forecast or planning notice.");
  if (classification === "discovery-only") reasons.push("The record is supported primarily by search, aggregator, or discovery metadata.");
  if (!confidenceOk) reasons.push("Source confidence is not medium or high.");

  return {
    classification,
    label: classification.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    actionable: classification === "verified-open",
    summaryEligible: classification === "verified-open" && structuredDirectEvidence,
    sourceType,
    reasons: Array.from(new Set(reasons)),
    hasFutureDeadline,
    deadlineKnown,
    buyerKnown,
    solicitationLike,
    sourceVerified,
    sourceAuthority: sourceVerified ? "trusted" : aggregator ? "medium" : "low",
    evidenceFingerprint: createHash("sha256").update([
      classification,
      opp.title,
      opp.agency,
      opp.type,
      opp.status,
      opp.postedDate,
      opp.responseDeadline,
      canonicalSamOpportunityUrl(url),
      opp.description,
      opp.estimatedValue,
      opp.awardAmount,
      opp.ceilingValue,
      opp.floorValue,
    ].map((value) => String(value ?? "")).join("|")).digest("hex"),
  };
}

export function qualityMatchesView(quality: OpportunityQualityView, view: OpportunityViewMode): boolean {
  if (view === "all") return true;
  if (view === "actionable") return quality.classification === "verified-open";
  if (view === "needs-verification") return quality.classification === "needs-verification" || quality.classification === "discovery-only";
  return ["closed", "archived", "award", "forecast"].includes(quality.classification);
}

export function opportunityQualityRank(opp: OpportunityLike, quality: OpportunityQualityView, now = new Date()): number {
  const deadline = deadlineEndForComparison(opp.responseDeadline);
  const days = deadline ? Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86400000)) : 999;
  const relevance = Number.parseFloat(String(opp.relevanceScore ?? "50"));
  const classScore = quality.classification === "verified-open" ? 10000 : quality.classification === "needs-verification" ? 5000 : quality.classification === "discovery-only" ? 3000 : 0;
  const deadlineScore = quality.hasFutureDeadline ? Math.max(0, 120 - Math.abs(days - 21)) : 0;
  const sourceScore = quality.sourceVerified ? 300 : quality.sourceType === "aggregator" ? 50 : 0;
  const completeScore = [quality.deadlineKnown, quality.buyerKnown, quality.solicitationLike, quality.sourceVerified].filter(Boolean).length * 25;
  const recency = opp.postedDate ? Math.max(0, 100 - Math.floor((now.getTime() - new Date(opp.postedDate).getTime()) / 86400000)) : 0;
  return classScore + deadlineScore + sourceScore + completeScore + (Number.isFinite(relevance) ? relevance : 50) + recency;
}

export interface QualityPageResult<T extends OpportunityLike> {
  data: Array<T & { quality: OpportunityQualityView }>;
  total: number;
}

export function opportunityCollapseKey(opp: OpportunityLike): string {
  const url = canonicalSamOpportunityUrl(opp.samUrl ?? opp.sourceUrl ?? opp.url);
  if (url) return `url:${url.toLowerCase()}`;
  const sol = String(opp.solicitationNumber ?? opp.noticeId ?? "").trim().toLowerCase();
  if (sol) {
    const agency = String(opp.agency ?? "").trim().toLowerCase();
    return `sol:${agency}:${sol}`;
  }
  return `id:${opp.id ?? Math.random()}`;
}

export function buildOpportunityQualityPage<T extends OpportunityLike>(
  rows: T[],
  view: OpportunityViewMode,
  page: number,
  limit: number,
  now = new Date(),
): QualityPageResult<T> {
  const accumulator = new OpportunityQualityPageAccumulator<T>(view, page, limit, now);
  rows.forEach((row) => accumulator.add(row));
  return accumulator.finish();
}

/**
 * Produces an exact quality-view total and page without retaining every database
 * row. Only a compact best-score entry per canonical key plus the requested
 * ranking window are kept while route batches stream through this accumulator.
 */
export class OpportunityQualityPageAccumulator<T extends OpportunityLike> {
  private readonly bestScores = new Map<string, number>();
  private readonly top = new Map<string, T & { quality: OpportunityQualityView; __qualityRank: number }>();
  private readonly offset: number;
  private readonly capacity: number;

  constructor(
    private readonly view: OpportunityViewMode,
    page: number,
    private readonly limit: number,
    private readonly now = new Date(),
  ) {
    this.offset = (Math.max(1, page) - 1) * limit;
    this.capacity = this.offset + limit;
  }

  add(row: T): void {
    const quality = classifyOpportunityQuality(row, this.now);
    if (!qualityMatchesView(quality, this.view)) return;
    const key = opportunityCollapseKey(row);
    const score = opportunityQualityRank(row, quality, this.now);
    const previous = this.bestScores.get(key);
    if (previous != null && previous >= score) return;
    this.bestScores.set(key, score);

    this.top.delete(key);
    const candidate = { ...row, quality, __qualityRank: score };
    if (this.top.size < this.capacity) {
      this.top.set(key, candidate);
      return;
    }

    let weakestKey: string | null = null;
    let weakestScore = Number.POSITIVE_INFINITY;
    for (const [candidateKey, current] of this.top) {
      if (current.__qualityRank < weakestScore) {
        weakestKey = candidateKey;
        weakestScore = current.__qualityRank;
      }
    }
    if (weakestKey && score > weakestScore) {
      this.top.delete(weakestKey);
      this.top.set(key, candidate);
    }
  }

  finish(): QualityPageResult<T> {
    const sorted = Array.from(this.top.values()).sort((a, b) => b.__qualityRank - a.__qualityRank);
    return {
      data: sorted.slice(this.offset, this.offset + this.limit).map(({ __qualityRank: _rank, ...row }) => row as T & { quality: OpportunityQualityView }),
      total: this.bestScores.size,
    };
  }
}

export type SummaryIneligibilityReason =
  | "authoritative_content_unavailable"
  | "future_deadline_unverified"
  | "discovery_only"
  | "record_not_actionable";

export function summaryIneligibilityReason(quality: OpportunityQualityView, hasAuthoritativeContent: boolean): SummaryIneligibilityReason | null {
  if (quality.classification === "discovery-only") return "discovery_only";
  if (!quality.hasFutureDeadline) return "future_deadline_unverified";
  if (!quality.actionable) return "record_not_actionable";
  if (!hasAuthoritativeContent && !quality.summaryEligible) return "authoritative_content_unavailable";
  return null;
}

export function plainSummaryIneligibilityReason(reason: SummaryIneligibilityReason): string {
  switch (reason) {
    case "authoritative_content_unavailable": return "Authoritative solicitation content has not been verified.";
    case "future_deadline_unverified": return "A future submission deadline could not be confirmed.";
    case "discovery_only": return "This is a discovery lead and must be verified before an AI brief is available.";
    case "record_not_actionable": return "This record is not classified as an open, actionable solicitation.";
  }
}

export function summaryEvidenceFingerprint(quality: OpportunityQualityView, authoritativeContent: unknown): string {
  return createHash("sha256")
    .update(`${quality.evidenceFingerprint}|${String(authoritativeContent ?? "").replace(/\s+/g, " ").trim()}`)
    .digest("hex");
}

export function isLikelySnippet(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (!text) return true;
  return text.length < 800 || /^\.\.\./.test(text) || /\b(search result|snippet|ai analysis pending|web discovery)\b/i.test(text);
}
