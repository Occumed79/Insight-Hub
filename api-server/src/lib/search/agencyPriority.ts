/**
 * Agency targeting: SEARCH-PRIORITY metadata, deliberately separate from relevance.
 *
 * The agencies to prefer, the agency codes/names that filter provider requests and the matching rule all come from
 * Neon (facts of category `target_agency`, carried on `profile.searchPriority`). This module is the only reader.
 *
 * Contract:
 *  - It orders and filters search work and results. It never produces or changes a relevance score or verdict.
 *  - The classifier (`relevance.ts`) and the decision (`relevanceDecision.ts`) do not import it, and relevance
 *    inputs carry no agency field, so the accept/review/reject decision is agency-neutral by construction.
 */
import { getRelevanceProfile, type RelevanceProfile } from "./relevanceProfile";

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Number of preferred-agency terms (whole-word match) present in the agency text; 0 = no preference. */
export function agencyPriority(agencyText: string | null | undefined, profile: RelevanceProfile = getRelevanceProfile()): number {
  const text = ` ${String(agencyText ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  if (text.trim() === "") return 0;
  let hits = 0;
  for (const term of profile.searchPriority.agencyTerms) {
    const normalised = term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (normalised && new RegExp(`(?:^| )${escapeRe(normalised)}(?: |$)`).test(text.trim())) hits += 1;
  }
  return hits;
}

/** Comparator: preferred agencies first. Use only as a tie-break or ordering key, never as a score. */
export function byAgencyPriority<T>(agencyOf: (item: T) => string | null | undefined, profile: RelevanceProfile = getRelevanceProfile()) {
  return (a: T, b: T): number => agencyPriority(agencyOf(b), profile) - agencyPriority(agencyOf(a), profile);
}

/** Agency codes to filter forecast requests by (empty = do not filter). */
export function forecastAgencyCodes(profile: RelevanceProfile = getRelevanceProfile()): string[] {
  return profile.searchPriority.agencyCodes;
}

/** Awarding-agency names to filter award searches by (empty = do not filter). */
export function awardingAgencyNames(profile: RelevanceProfile = getRelevanceProfile()): string[] {
  return profile.searchPriority.awardingAgencies;
}
