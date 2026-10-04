/**
 * Web-search query text for the search-engine providers, derived from the Neon relevance profile at call time.
 *
 * Providers decide HOW to ask (engine operators, result counts, date filters); WHAT to ask for comes from the profile:
 *   - service terms and procurement terms <- profile.searchBundles (facts: rfp_search_bundle)
 *   - exclusion operators                  <- bundle exclusions plus the leading triggers of the profile's post-award
 *                                             and not-a-procurement hard rules
 * Nothing here defines Occu-Med vocabulary. Callers must invoke these per request, never at module load, so a
 * refreshed profile changes the next query.
 */
import { getRelevanceProfile, type ProfileSearchBundle, type RelevanceProfile } from "./relevanceProfile";

/** Hard-rule machine actions whose triggers become negative operators (award notices, job ads). */
const EXCLUSION_RULE_ACTIONS = new Set(["reject_post_award_notice", "reject_not_a_procurement"]);
/** Search engines degrade on long operator lists; this bounds one operator group, never the vocabulary itself. */
const TRIGGERS_PER_EXCLUSION_RULE = 2;
const SERVICE_TERMS_PER_QUERY = 3;
const PROCUREMENT_TERMS_PER_QUERY = 3;

function operand(term: string): string {
  const t = term.trim();
  return /\s/.test(t) && !t.startsWith('"') ? `"${t}"` : t;
}

function plain(term: string): string {
  return term.replace(/"/g, "").replace(/\s+/g, " ").trim();
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

function serviceBundles(profile: RelevanceProfile): ProfileSearchBundle[] {
  return profile.searchBundles.filter((b) => b.serviceTerms.length > 0);
}

/** Procurement words (RFP, solicitation, ...) the profile's bundles pair with service terms, most common first. */
export function profileProcurementTerms(profile: RelevanceProfile = getRelevanceProfile(), max = PROCUREMENT_TERMS_PER_QUERY): string[] {
  const counts = new Map<string, number>();
  for (const bundle of serviceBundles(profile)) {
    for (const term of bundle.procurementTerms) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([term, count], index) => ({ term, count, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, max)
    .map((entry) => entry.term);
}

/** Negative operators (`-"award notice" -"job posting"`) from bundle exclusions and the profile's exclusion rules. */
export function profileExclusionOperators(profile: RelevanceProfile = getRelevanceProfile(), bundleExclusions: string[] = []): string {
  const fromRules = profile.rules
    .filter((r) => r.hard && EXCLUSION_RULE_ACTIONS.has(r.action))
    .flatMap((r) => r.triggers.slice(0, TRIGGERS_PER_EXCLUSION_RULE));
  return uniq([...bundleExclusions, ...fromRules])
    .map((t) => `-${operand(t.replace(/^-/, ""))}`)
    .join(" ");
}

/** One boolean-operator query per service bundle: (service terms) (procurement terms) year exclusions. */
export function profileBooleanQueries(year: number, profile: RelevanceProfile = getRelevanceProfile()): string[] {
  return serviceBundles(profile).map((bundle) => {
    const services = bundle.serviceTerms.slice(0, SERVICE_TERMS_PER_QUERY).map(operand).join(" OR ");
    const procurement = bundle.procurementTerms.slice(0, PROCUREMENT_TERMS_PER_QUERY).map(operand).join(" OR ");
    return [`(${services})`, procurement ? `(${procurement})` : "", String(year), profileExclusionOperators(profile, bundle.exclusions)]
      .filter(Boolean)
      .join(" ");
  });
}

/** One natural-language query per service bundle, for neural / conversational engines. */
export function profileNaturalQueries(year: number, profile: RelevanceProfile = getRelevanceProfile()): string[] {
  const [lead, second] = profileProcurementTerms(profile, 2);
  return serviceBundles(profile).map((bundle) => {
    const services = bundle.serviceTerms.slice(0, 2).map(plain).join(" or ");
    return [`open`, lead, second, "for", services, String(year)].filter(Boolean).join(" ");
  });
}

/** The lead service term of every bundle, unquoted: short phrases that describe Occu-Med's scope in a search string. */
export function profileLeadPhrases(profile: RelevanceProfile = getRelevanceProfile(), max = Infinity): string[] {
  return uniq(serviceBundles(profile).map((b) => plain(b.serviceTerms[0] ?? ""))).slice(0, max);
}

/** `("lead term" OR "lead term" ...)` scoping a user keyword to Occu-Med's scope; "" when the profile has no bundles. */
export function profileScopeOperand(profile: RelevanceProfile = getRelevanceProfile(), max = 6): string {
  const leads = uniq(serviceBundles(profile).map((b) => b.serviceTerms[0] ?? "")).slice(0, max);
  return leads.length ? `(${leads.map(operand).join(" OR ")})` : "";
}

/** `n` items spread evenly across the list, so a provider that runs only the first few queries still covers every bundle. */
export function spreadSample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const picked: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const index = Math.floor((i * items.length) / n);
    if (!seen.has(index)) {
      seen.add(index);
      picked.push(items[index]!);
    }
  }
  return picked;
}

/** Queries for a user-supplied keyword, scoped to the profile; engine operator style is chosen by the caller. */
export function keywordQueries(keywords: string, year: number, profile: RelevanceProfile = getRelevanceProfile()): string[] {
  const procurement = profileProcurementTerms(profile, 2).join(" ");
  const scope = profileLeadPhrases(profile, 3).join(" ");
  return [
    `${keywords} ${procurement} ${year}`.replace(/\s+/g, " ").trim(),
    `${keywords} government bid procurement ${year}`,
    `${keywords} ${scope} ${year}`.replace(/\s+/g, " ").trim(),
  ];
}
