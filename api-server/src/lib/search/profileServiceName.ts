/**
 * Does a "buyer" string actually name an Occu-Med service line (a scraper that put the service where the
 * agency belongs)? Answered from the profile's category labels and evidence terms, never a local list.
 */
import { getRelevanceProfile, type RelevanceProfile } from "./relevanceProfile";

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

let cachedFor: RelevanceProfile | null = null;
let cachedNames = new Set<string>();

function serviceNames(profile: RelevanceProfile): Set<string> {
  if (cachedFor !== profile) {
    cachedNames = new Set(
      [
        ...profile.categories.map((c) => c.label),
        ...profile.allServiceTerms,
        ...profile.generalExplicit,
      ]
        .map(normalize)
        .filter(Boolean),
    );
    cachedFor = profile;
  }
  return cachedNames;
}

export function isServiceNameNotBuyer(
  value: string,
  profile: RelevanceProfile = getRelevanceProfile(),
): boolean {
  const n = normalize(value);
  return n.length > 0 && serviceNames(profile).has(n);
}
