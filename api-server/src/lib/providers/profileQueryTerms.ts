/**
 * Query text for government-API providers, derived from the Occu-Med relevance profile at call time.
 *
 * Providers decide HOW to call their API (parameters, pagination, parsing); WHAT to ask for comes from here.
 * Nothing in this file defines vocabulary: every phrase is a search-bundle service term or a direct phrase
 * from the profile, so a profile refresh changes the queries without a code change.
 */
import { getRelevanceProfile, type RelevanceProfile } from "../search/relevanceProfile";
import { samGovTitleProfiles } from "./samGovQuality";

/** One short lead query per profile search bundle (bundle order, de-duplicated). */
export function profileLeadQueries(limit = Infinity, profile: RelevanceProfile = getRelevanceProfile()): string[] {
  return samGovTitleProfiles(profile).map((entry) => entry.title).slice(0, limit);
}

/** Free-text semantic query built from the profile's lead queries, bounded to `maxChars`. */
export function profileSemanticQuery(maxChars = 300, profile: RelevanceProfile = getRelevanceProfile()): string {
  const parts: string[] = [];
  let length = 0;
  for (const lead of profileLeadQueries(Infinity, profile)) {
    const next = length + lead.length + (parts.length ? 1 : 0);
    if (next > maxChars) break;
    parts.push(lead);
    length = next;
  }
  return parts.join(" ");
}

/** Phrases to describe Occu-Med services in a search string: bundle lead queries first, then direct phrases. */
export function profileSearchPhrases(limit: number, profile: RelevanceProfile = getRelevanceProfile()): string[] {
  const direct = [...profile.categories.flatMap((c) => c.explicit), ...profile.generalExplicit];
  return Array.from(new Set([...profileLeadQueries(Infinity, profile), ...direct])).slice(0, limit);
}

/** `"a" OR "b" OR ...` from phrases (quotes inside a phrase are dropped). */
export function quotedOr(phrases: readonly string[]): string {
  return phrases
    .map((phrase) => phrase.replace(/"/g, "").trim())
    .filter(Boolean)
    .map((phrase) => `"${phrase}"`)
    .join(" OR ");
}

/** Procurement wording from the profile's search bundles that carry service terms (de-duplicated, bundle order). */
export function profileProcurementTerms(limit = Infinity, profile: RelevanceProfile = getRelevanceProfile()): string[] {
  const terms = profile.searchBundles.filter((b) => b.serviceTerms.length > 0).flatMap((b) => b.procurementTerms);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out.slice(0, limit);
}

/** Policy / funding wording from the profile's search bundles that carry no service terms (e.g. the state policy bundle). */
export function profilePolicyTerms(limit = Infinity, profile: RelevanceProfile = getRelevanceProfile()): string[] {
  const terms = profile.searchBundles.filter((b) => b.serviceTerms.length === 0).flatMap((b) => b.procurementTerms);
  return Array.from(new Set(terms)).slice(0, limit);
}

/** Word-bounded, case-insensitive alternation of literal terms; null when there are no terms. */
export function termRegex(terms: readonly string[]): RegExp | null {
  const parts = terms
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  return parts.length > 0 ? new RegExp(`\\b(?:${parts.join("|")})\\b`, "i") : null;
}

/** Exact, positive discovery codes of one classification system ("NAICS", "PSC" or "CPV"), registered/capability tiers first. */
export function profileCodesFor(systemPrefix: "NAICS" | "PSC" | "CPV", profile: RelevanceProfile = getRelevanceProfile()): string[] {
  const order = ["registered", "capability", "classification-drift", "secondary-adjacent"];
  const rank = (tier: string) => (order.includes(tier) ? order.indexOf(tier) : order.length);
  return Array.from(
    new Set(
      profile.discoveryCodes
        .filter((d) => d.system.toUpperCase().startsWith(systemPrefix) && d.match === "exact" && d.effect.startsWith("include"))
        .sort((a, b) => rank(a.tier) - rank(b.tier))
        .map((d) => d.code.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * NAICS codes for lookups: the reference's registered codes first (loaded from the Occu-Med reference when
 * available), then the profile's discovery codes. Async because the reference is read through a cached loader.
 */
export async function profileNaicsCodes(limit = Infinity): Promise<string[]> {
  try {
    const { getOccuMedSearchProfile } = await import("../search/occumedSearchProfile");
    return (await getOccuMedSearchProfile()).naics.slice(0, limit);
  } catch {
    return profileCodesFor("NAICS").slice(0, limit);
  }
}
