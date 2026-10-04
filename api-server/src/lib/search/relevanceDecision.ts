/**
 * The one accept / review / reject decision, applied identically by every consumer.
 *
 * The classifier decides whether the Neon evidence rules are satisfied; this function applies the two
 * canonical thresholds (facts relevance.accept_min / relevance.review_min in Neon) to its result. There are
 * no other thresholds anywhere: judges, scorers, ingestion and the read-time gate all call this.
 *
 * The decision depends on the notice and the profile only. It never looks at which provider found it.
 */
import type { RelevanceResult } from "./relevance";
import { getRelevanceProfile, type RelevanceProfile } from "./relevanceProfile";

export type RelevanceVerdict = "accept" | "review" | "reject";

export interface RelevanceDecision {
  verdict: RelevanceVerdict;
  score: number;
  /** "rules": rejected by evidence rules. "threshold": decided by the canonical thresholds. */
  basis: "rules" | "threshold";
  reason: string;
  profileSource: RelevanceProfile["source"];
  thresholds: RelevanceProfile["thresholds"];
}

export function decideRelevance(
  result: RelevanceResult,
  profile: RelevanceProfile = getRelevanceProfile(),
): RelevanceDecision {
  const { acceptMin, reviewMin } = profile.thresholds;
  const base = { score: result.score, profileSource: profile.source, thresholds: profile.thresholds };
  if (result.rejected) {
    // Evidence incomplete but not contradicted: adjudicate when the score reaches the review floor.
    if (result.confidence === "insufficient" && result.score >= reviewMin) {
      return { ...base, verdict: "review", basis: "threshold", reason: result.rejectReason ?? "Insufficient evidence; adjudicate" };
    }
    return { ...base, verdict: "reject", basis: "rules", reason: result.rejectReason ?? "Rejected by Occu-Med rules" };
  }
  if (result.score >= acceptMin) {
    return { ...base, verdict: "accept", basis: "threshold", reason: `Score ${result.score} >= accept_min ${acceptMin}` };
  }
  if (result.score >= reviewMin) {
    return { ...base, verdict: "review", basis: "threshold", reason: `Score ${result.score} between review_min ${reviewMin} and accept_min ${acceptMin}` };
  }
  return { ...base, verdict: "reject", basis: "threshold", reason: `Score ${result.score} < review_min ${reviewMin}` };
}

export type DiscoverySystem = "NAICS 2022" | "PSC" | "CPV";

export interface DiscoveryCodeMatch {
  system: string;
  code: string;
  tier: string;
  effect: string;
  title: string;
}

/**
 * Official classification code (NAICS / PSC / CPV) -> Neon discovery-code fact. A match means "keep the record for
 * downstream reasoning"; it never overrides a rule rejection and never makes a record actionable on its own.
 */
export function matchDiscoveryCode(
  system: DiscoverySystem,
  rawCode: string | null | undefined,
  profile: RelevanceProfile = getRelevanceProfile(),
): DiscoveryCodeMatch | null {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code) return null;
  for (const d of profile.discoveryCodes) {
    if (d.system !== system) continue;
    const hit = d.match === "prefix" ? code.startsWith(d.code.toUpperCase()) : code === d.code.toUpperCase();
    if (hit) return { system: d.system, code: d.code, tier: d.tier, effect: d.effect, title: d.title };
  }
  return null;
}

/** Tiers whose codes are Occu-Med service lines (not merely adjacent) and may lift a threshold reject to review. */
export function discoveryCodeSupportsReview(match: DiscoveryCodeMatch | null): boolean {
  return match !== null && (match.tier === "capability" || match.tier === "registered") && match.effect.startsWith("include");
}

/** Decision with the Neon discovery-code lift: threshold rejects become review when an Occu-Med classification code matches. */
export function decideRelevanceWithCodes(
  result: RelevanceResult,
  codes: Array<{ system: DiscoverySystem; code: string | null | undefined }>,
  profile: RelevanceProfile = getRelevanceProfile(),
): RelevanceDecision & { discovery: DiscoveryCodeMatch | null } {
  const decision = decideRelevance(result, profile);
  const discovery = codes.map((c) => matchDiscoveryCode(c.system, c.code, profile)).find((m) => m !== null) ?? null;
  if (decision.verdict === "reject" && decision.basis === "threshold" && discoveryCodeSupportsReview(discovery)) {
    return { ...decision, verdict: "review", reason: `${decision.reason}; classification code ${discovery!.system} ${discovery!.code} keeps it for review`, discovery };
  }
  return { ...decision, discovery };
}
