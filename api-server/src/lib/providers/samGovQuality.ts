import { getRelevanceProfile, type RelevanceProfile } from "../search/relevanceProfile";

export interface SamOpportunity {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  type?: string;
  baseType?: string;
  active?: string;
  naicsCode?: string;
  classificationCode?: string;
  postedDate?: string;
  responseDeadLine?: string;
  archiveDate?: string;
  typeOfSetAside?: string;
  typeOfSetAsideDescription?: string;
  placeOfPerformance?: {
    city?: { name?: string };
    state?: { code?: string };
  };
  officeAddress?: { city?: string; state?: string };
  description?: string;
  uiLink?: string;
  award?: { amount?: number | string; awardee?: { name?: string } };
}

export interface SamTitleProfile {
  /** SAM `title` query sent to the API. */
  title: string;
  /** Normalised phrases that, found in a caller's keywords, select this title query. */
  aliases: string[];
}

const CUSTOM_QUERY_NOISE =
  /\b(?:active|bid|bids|city|contract|contracts|county|due|federal|find|government|open|opportunities|opportunity|procurement|proposal|proposals|request|rfp|rfq|services?|solicitation|state)\b/gi;
const BID_READY_TYPE_RE = /^(?:solicitation|combined synopsis\/solicitation)$/i;

function normalizeQueryText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQueryNoise(value: string): string {
  return value.replace(CUSTOM_QUERY_NOISE, " ").replace(/\s+/g, " ").trim();
}

/**
 * SAM title queries, one per Neon search bundle that carries service terms. The service
 * vocabulary is read from the relevance profile at call time; the first service term of a
 * bundle is its lead query and every service term is an alias that selects it.
 */
export function samGovTitleProfiles(profile: RelevanceProfile = getRelevanceProfile()): SamTitleProfile[] {
  const out: SamTitleProfile[] = [];
  const seen = new Set<string>();
  for (const bundle of profile.searchBundles) {
    const aliases = Array.from(new Set(bundle.serviceTerms.map(normalizeQueryText).filter(Boolean)));
    if (aliases.length === 0) continue;
    const title = stripQueryNoise(aliases[0]!) || aliases[0]!;
    if (seen.has(title)) continue;
    seen.add(title);
    out.push({ title, aliases });
  }
  return out;
}

export function buildSamGovTitleQueries(
  keywords?: string,
  profile: RelevanceProfile = getRelevanceProfile(),
): string[] {
  const normalized = normalizeQueryText(keywords ?? "");
  if (!normalized) return [];

  const matched = samGovTitleProfiles(profile)
    .filter((entry) => entry.aliases.some((alias) => normalized.includes(alias)))
    .map((entry) => entry.title);
  if (matched.length > 0) return Array.from(new Set(matched)).slice(0, 4);

  const custom = stripQueryNoise(normalized);
  return custom.length >= 3 ? [custom.slice(0, 80)] : [];
}

/**
 * Autonomous SAM runs should never burn the daily quota on one giant generic
 * federal result set. Instead, they rotate through a few profile service titles
 * per run so every few runs cover the full service ontology.
 */
export function buildSamGovAutonomousTitleQueries(
  cursor = 0,
  count = 2,
  profile: RelevanceProfile = getRelevanceProfile(),
): string[] {
  const titles = samGovTitleProfiles(profile).map((entry) => entry.title);
  if (titles.length === 0) return [];
  const normalizedCursor = ((Math.floor(cursor) % titles.length) + titles.length) % titles.length;
  const take = Math.max(1, Math.min(Math.floor(count), titles.length));
  return Array.from({ length: take }, (_, offset) =>
    titles[(normalizedCursor + offset) % titles.length]!,
  );
}

export function isBidReadySamOpportunity(
  opportunity: SamOpportunity,
  now = new Date(),
): boolean {
  if (String(opportunity.active ?? "").toLowerCase() !== "yes") return false;
  if (!BID_READY_TYPE_RE.test(opportunity.type ?? opportunity.baseType ?? "")) {
    return false;
  }
  if (
    opportunity.award?.amount != null ||
    opportunity.award?.awardee?.name?.trim()
  ) {
    return false;
  }
  const deadline = opportunity.responseDeadLine
    ? new Date(opportunity.responseDeadLine)
    : null;
  if (!deadline || Number.isNaN(deadline.getTime())) return false;
  return deadline.getTime() > now.getTime();
}
