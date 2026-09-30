/**
 * The Occu-Med search profile: the NAICS/PSC codes and direct RFP phrases that
 * should steer lookups and the relevance gate. Comes from the live reference
 * profile (OCCU_MED_AWARE) merged with the built-in SAM taxonomy, so a profile
 * edit changes what is searched without a code change. Best-effort: on any
 * failure it returns the built-in taxonomy only.
 */
import {
  SAM_GOV_DISCOVERY_TAXONOMY,
  type SamGovTaxonomyTier,
} from "../providers/samGovTaxonomy";
import { setProfileDirectPhrases } from "./relevance";

export interface OccuMedSearchProfile {
  naics: string[];
  psc: string[];
  directPhrases: string[];
  loaded: boolean;
}

const LOAD_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CODES = 25;
const PRIORITY: SamGovTaxonomyTier[] = ["registered", "capability", "classification-drift", "secondary-adjacent"];

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

/** Built-in codes, most important tiers first. */
export function builtInCodes(): { naics: string[]; psc: string[] } {
  const ordered = (entries: readonly { code: string; tier: SamGovTaxonomyTier }[]) =>
    [...entries]
      .sort((a, b) => PRIORITY.indexOf(a.tier) - PRIORITY.indexOf(b.tier))
      .map((entry) => entry.code);
  return {
    naics: uniq(ordered(SAM_GOV_DISCOVERY_TAXONOMY.naics)),
    psc: uniq(ordered(SAM_GOV_DISCOVERY_TAXONOMY.psc)),
  };
}

/** Pure merge: profile codes first (the team's own list), then built-ins. */
export function mergeSearchProfile(
  profile: { naics: string[]; psc: string[]; directPhrases: string[] } | null,
): OccuMedSearchProfile {
  const base = builtInCodes();
  return {
    naics: uniq([...(profile?.naics ?? []), ...base.naics]).slice(0, MAX_CODES),
    psc: uniq([...(profile?.psc ?? []), ...base.psc]).slice(0, MAX_CODES),
    directPhrases: uniq(profile?.directPhrases ?? []),
    loaded: profile != null,
  };
}

let cached: { value: OccuMedSearchProfile; expiresAt: number } | null = null;

export async function getOccuMedSearchProfile(): Promise<OccuMedSearchProfile> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  let profile: { naics: string[]; psc: string[]; directPhrases: string[] } | null = null;
  try {
    const { getOccuMedReference } = await import("../occumedAware/index");
    const ref = await Promise.race([
      getOccuMedReference(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out")), LOAD_TIMEOUT_MS).unref?.(),
      ),
    ]);
    if (ref.awareLoaded) {
      profile = {
        naics: [ref.primaryNaics, ...ref.additionalNaics].filter((code) => /^\d{6}$/.test(code)),
        psc: ref.productServiceCodes.filter((code) => /^[A-Z0-9]\d{2}\w?$/.test(code)),
        directPhrases: ref.rfpDirectPhrases,
      };
    }
  } catch {
    profile = null;
  }
  const value = mergeSearchProfile(profile);
  // The gate reads phrases synchronously, so publish them whenever we load.
  if (profile) setProfileDirectPhrases(profile.directPhrases);
  cached = { value, expiresAt: Date.now() + (profile ? CACHE_TTL_MS : 60_000) };
  return value;
}

export function clearOccuMedSearchProfileCache(): void {
  cached = null;
}
