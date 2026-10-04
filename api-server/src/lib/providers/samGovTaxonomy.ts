import { getRelevanceProfile, type ProfileDiscoveryCode, type RelevanceProfile } from "../search/relevanceProfile";

/**
 * SAM.gov classification discovery lanes.
 *
 * The NAICS / PSC codes (and their tiers) are Neon `rfp_discovery_code` facts in the
 * Occu-Med relevance profile. This module only adapts them to SAM's `ncode` / `ccode`
 * query parameters and reads the profile at call time, so a profile refresh changes
 * what is searched without a code change.
 */
export type SamGovTaxonomyTier =
  | "registered"
  | "capability"
  | "classification-drift"
  | "secondary-adjacent";

export interface SamGovTaxonomyEntry {
  code: string;
  title: string;
  tier: SamGovTaxonomyTier;
  /** Why the code is a discovery lane: the profile tier and the profile's own effect value. */
  rationale: string;
}

export interface SamGovClassificationQuery {
  parameter: "ncode" | "ccode";
  code: string;
  title: string;
  tier: SamGovTaxonomyTier;
  /**
   * Classification history and the SAM entity profile are positive discovery
   * evidence only. They must never become a whitelist or a negative filter.
   */
  effect: "include";
}

const TIER_ORDER: SamGovTaxonomyTier[] = ["registered", "capability", "classification-drift", "secondary-adjacent"];

const isTier = (value: string): value is SamGovTaxonomyTier => (TIER_ORDER as string[]).includes(value);

function entriesFor(profile: RelevanceProfile, systemPrefix: "NAICS" | "PSC"): SamGovTaxonomyEntry[] {
  const seen = new Set<string>();
  const out: SamGovTaxonomyEntry[] = [];
  const candidates = profile.discoveryCodes.filter(
    (d: ProfileDiscoveryCode) =>
      d.system.toUpperCase().startsWith(systemPrefix) &&
      // SAM takes one concrete code per request; prefix families are matchers, not query codes.
      d.match === "exact" &&
      d.effect.startsWith("include") &&
      isTier(d.tier),
  );
  for (const d of candidates) {
    const code = d.code.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      title: d.title,
      tier: d.tier as SamGovTaxonomyTier,
      rationale: `Occu-Med relevance profile ${d.tier} discovery code (${d.effect}).`,
    });
  }
  // Stable sort: most important tiers first, profile order within a tier.
  return out
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => TIER_ORDER.indexOf(a.entry.tier) - TIER_ORDER.indexOf(b.entry.tier) || a.index - b.index)
    .map(({ entry }) => entry);
}

/** The SAM discovery taxonomy, read from the relevance profile now (not at module load). */
export function samGovDiscoveryTaxonomy(profile: RelevanceProfile = getRelevanceProfile()): {
  naics: readonly SamGovTaxonomyEntry[];
  psc: readonly SamGovTaxonomyEntry[];
} {
  return { naics: entriesFor(profile, "NAICS"), psc: entriesFor(profile, "PSC") };
}

/**
 * Lazy view of the taxonomy for consumers that read `.naics` / `.psc`. Every property read
 * consults the current profile; nothing is captured at module load.
 */
export const SAM_GOV_DISCOVERY_TAXONOMY: {
  readonly naics: readonly SamGovTaxonomyEntry[];
  readonly psc: readonly SamGovTaxonomyEntry[];
} = {
  get naics() {
    return samGovDiscoveryTaxonomy().naics;
  },
  get psc() {
    return samGovDiscoveryTaxonomy().psc;
  },
};

/**
 * Return every known positive SAM discovery classification. This intentionally
 * does not expose a reject list: an opportunity using an unlisted code remains
 * eligible for discovery and semantic reasoning through the other search lanes.
 */
export function buildSamGovClassificationQueries(
  profile: RelevanceProfile = getRelevanceProfile(),
): SamGovClassificationQuery[] {
  const taxonomy = samGovDiscoveryTaxonomy(profile);
  return [
    ...taxonomy.naics.map((entry) => ({
      parameter: "ncode" as const,
      code: entry.code,
      title: entry.title,
      tier: entry.tier,
      effect: "include" as const,
    })),
    ...taxonomy.psc.map((entry) => ({
      parameter: "ccode" as const,
      code: entry.code,
      title: entry.title,
      tier: entry.tier,
      effect: "include" as const,
    })),
  ];
}
