/**
 * The Occu-Med search profile: the NAICS/PSC codes and direct RFP phrases that
 * steer lookups. Every value comes from the Neon relevance profile (discovery
 * codes and curated phrases) plus the registered codes in the reference facts,
 * so a profile edit changes what is searched without a code change. Best-effort:
 * if the live profile is unavailable the snapshot of it is used.
 */
import { getRelevanceProfile, type RelevanceProfile } from "./relevanceProfile";

export interface OccuMedSearchProfile {
  naics: string[];
  psc: string[];
  directPhrases: string[];
  loaded: boolean;
}

const LOAD_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CODES = 25;
const TIER_ORDER = ["registered", "capability", "classification-drift", "secondary-adjacent"];

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

/** Discovery codes from the relevance profile, most important tiers first. Prefix families are not search codes. */
export function profileDiscoveryCodes(profile: RelevanceProfile = getRelevanceProfile()): { naics: string[]; psc: string[] } {
  const ordered = (system: string) =>
    profile.discoveryCodes
      .filter((c) => c.system.toUpperCase().startsWith(system) && c.match === "exact" && c.effect.startsWith("include"))
      .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
      .map((c) => c.code);
  return { naics: uniq(ordered("NAICS")), psc: uniq(ordered("PSC")) };
}

/** Direct phrases from the relevance profile (named categories first, then uncategorised direct phrases). */
export function profileDirectPhrases(profile: RelevanceProfile = getRelevanceProfile()): string[] {
  return uniq([...profile.categories.flatMap((c) => c.explicit), ...profile.generalExplicit]);
}

/** Pure merge: registered/reference codes first (the team's own list), then the profile's discovery codes. */
export function mergeSearchProfile(
  reference: { naics: string[]; psc: string[] } | null,
  profile: RelevanceProfile = getRelevanceProfile(),
): OccuMedSearchProfile {
  const base = profileDiscoveryCodes(profile);
  return {
    naics: uniq([...(reference?.naics ?? []), ...base.naics]).slice(0, MAX_CODES),
    psc: uniq([...(reference?.psc ?? []), ...base.psc]).slice(0, MAX_CODES),
    directPhrases: profileDirectPhrases(profile),
    loaded: reference != null || profile.source === "neon",
  };
}

let cached: { value: OccuMedSearchProfile; expiresAt: number } | null = null;

export async function getOccuMedSearchProfile(): Promise<OccuMedSearchProfile> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  let reference: { naics: string[]; psc: string[] } | null = null;
  try {
    const { getOccuMedReference } = await import("../occumedAware/index");
    const ref = await Promise.race([
      getOccuMedReference(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out")), LOAD_TIMEOUT_MS).unref?.(),
      ),
    ]);
    if (ref.awareLoaded) {
      reference = {
        naics: [ref.primaryNaics, ...ref.additionalNaics].filter((code) => /^\d{6}$/.test(code)),
        psc: ref.productServiceCodes.filter((code) => /^[A-Z0-9]\d{2}\w?$/.test(code)),
      };
    }
  } catch {
    reference = null;
  }
  const value = mergeSearchProfile(reference);
  cached = { value, expiresAt: Date.now() + (reference ? CACHE_TTL_MS : 60_000) };
  return value;
}

export function clearOccuMedSearchProfileCache(): void {
  cached = null;
}
