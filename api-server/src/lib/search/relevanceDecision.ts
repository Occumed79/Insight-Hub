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
