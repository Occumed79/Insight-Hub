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
const BAD_TYPE_RE = /award|forecast|tabulation|bid tab|purchase order|contract document|contract pdf|archive|archived|cancel|intent to award|notice of award|sole source/i;
const FORECAST_RE = /forecast|acquisition planning forecast|apfs/i;
const AWARD_RE = /award|awarded|purchase order|contract document|contract\.pdf|contract pdf|bid tabulation|intent to award|notice of award/i;
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
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

export function classifyOpportunityQuality(opp: OpportunityLike, now = new Date()): OpportunityQualityView {
  const tags = parseTags(opp.tags).map((t) => t.toLowerCase());
  const provider = String(opp.providerName ?? opp.providerKey ?? opp.source ?? "");
  const url = String(opp.samUrl ?? opp.sourceUrl ?? opp.url ?? "");
  const host = urlHost(url);
  const text = [opp.title, opp.type, opp.agency, opp.description, opp.notes, url, tags.join(" ")].filter(Boolean).join(" ");
  const deadline = deadlineEndForComparison(opp.responseDeadline);
  const deadlineKnown = Boolean(deadline);
  const hasFutureDeadline = Boolean(deadline && deadline.getTime() > now.getTime());
  const buyer = String(opp.agency ?? "").trim();
  const buyerKnown = buyer.length > 0 && !/^(unknown|unknown organization|occupational health|drug & alcohol screening|medical surveillance|government)$/i.test(buyer);
  const sourceConfidence = String(opp.sourceConfidence ?? "").toLowerCase();
  const confidenceOk = sourceConfidence === "high" || sourceConfidence === "medium" || (!sourceConfidence && TRUSTED_PROVIDERS.has(provider));
  const aggregator = AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  const discoveryProvider = DISCOVERY_PROVIDERS.has(provider) || tags.includes("ai-pending") || tags.includes("date-unknown");
  const officialHost = OFFICIAL_HOST_HINTS.some((h) => host === h.replace(/^\./, "") || host.endsWith(h));
  const trustedProvider = TRUSTED_PROVIDERS.has(provider);
  const sourceVerified = (trustedProvider || officialHost) && !discoveryProvider && !aggregator;
  const sourceType = discoveryProvider ? "search-discovery" : aggregator ? "aggregator" : trustedProvider ? "official-direct" : officialHost ? "verified-solicitation-page" : "unknown";
  const solicitationLike = SOLICITATION_RE.test(text) && !BAD_TYPE_RE.test(text) && !GENERAL_PAGE_RE.test(text);
  const reasons: string[] = [];

  let classification: OpportunityQualityClassification;
  if (String(opp.status).toLowerCase() === "archived") classification = "archived";
  else if (AWARD_RE.test(text)) classification = "award";
  else if (FORECAST_RE.test(text)) classification = "forecast";
  else if (deadlineKnown && !hasFutureDeadline) classification = "closed";
  else if (discoveryProvider || aggregator || GENERAL_PAGE_RE.test(text)) classification = "discovery-only";
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
    summaryEligible: classification === "verified-open",
    sourceType,
    reasons: Array.from(new Set(reasons)),
    hasFutureDeadline,
    deadlineKnown,
    buyerKnown,
    solicitationLike,
    sourceVerified,
    sourceAuthority: sourceVerified ? "trusted" : aggregator ? "medium" : "low",
    evidenceFingerprint: [classification, opp.title, opp.agency, opp.type, opp.status, opp.responseDeadline, canonicalSamOpportunityUrl(url), opp.description].join("|").slice(0, 2000),
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
