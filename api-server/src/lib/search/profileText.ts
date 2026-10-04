/**
 * Prompt and query text derived from the Neon relevance profile.
 *
 * Judges, extractors and query generators describe Occu-Med's scope with these helpers instead of carrying
 * their own service lists, scope rules or example vocabularies. All text here is assembled from profile
 * rows (categories, policies, buyer types, search bundles, thresholds); nothing is defined in this file.
 */
import { getRelevanceProfile, type RelevanceProfile } from "./relevanceProfile";

const JUDGE_POLICY_SCOPES = new Set(["rfp_judge", "rfp_search", "opportunity_research", "service_capability"]);
const JUDGE_RULE_SCOPES = ["opportunity_research", "rfp_search"];

/** Policies that govern judging, highest priority first. */
export function judgePolicies(profile: RelevanceProfile = getRelevanceProfile()) {
  return profile.policies
    .filter((p) => JUDGE_POLICY_SCOPES.has(p.applies_to) && p.must_follow)
    .sort((a, b) => b.priority - a.priority || a.policy_key.localeCompare(b.policy_key));
}

/** Hard scope rules that apply to judging opportunities, highest priority first. */
export function judgeRules(profile: RelevanceProfile = getRelevanceProfile()) {
  return profile.rules
    .filter((r) => {
      const applies = Array.isArray(r.scope.applies_to) ? (r.scope.applies_to as string[]) : [];
      return r.hard && applies.some((a) => JUDGE_RULE_SCOPES.includes(a)) && r.text;
    })
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
}

export const SCOPE_BLOCK_HEADER = "OCCU-MED SCOPE RULES AND POLICIES (from the reference profile):";

/** Scope rules and policies for judge/extractor prompts, rendered from the Neon rules and agent policies. */
export function judgeScopeBlock(profile: RelevanceProfile = getRelevanceProfile()): string {
  const rules = judgeRules(profile).map((r) => `- ${r.title}: ${r.text}`);
  const policies = judgePolicies(profile).map((p) => `- ${p.title}: ${p.instruction}`);
  if (!rules.length && !policies.length) return "";
  return [SCOPE_BLOCK_HEADER, rules.length ? `HARD RULES:\n${rules.join("\n")}` : "", policies.length ? `POLICIES YOU MUST FOLLOW:\n${policies.join("\n")}` : ""]
    .filter(Boolean)
    .join("\n");
}

/** Service lines Occu-Med performs: the profile's non-adjacent category labels. */
export function profileServiceLabels(profile: RelevanceProfile = getRelevanceProfile()): string[] {
  return profile.categories.filter((c) => !c.adjacentOnly).map((c) => c.label);
}

export function profileClientTypes(profile: RelevanceProfile = getRelevanceProfile()): string[] {
  return profile.targetBuyerTypes;
}

/** Score guidance for AI judges, expressed in the canonical thresholds. */
export function scoreGuidance(profile: RelevanceProfile = getRelevanceProfile()): string {
  const { acceptMin, reviewMin } = profile.thresholds;
  return `Score relevance 0-100. A record is approved only at ${acceptMin} or above; below ${acceptMin} set isOpportunity to false. Scores between ${reviewMin} and ${acceptMin - 1} mean "possible but unproven" and must be false.`;
}

/** Default web-search queries built from the profile's search bundles. */
export function profileDefaultQueries(year: number, profile: RelevanceProfile = getRelevanceProfile()): string[] {
  return profile.searchBundles
    .filter((b) => b.serviceTerms.length > 0)
    .map((b) => {
      const services = b.serviceTerms.slice(0, 3).join(" OR ");
      const procurement = b.procurementTerms.slice(0, 2).join(" OR ");
      return `${services} ${procurement} open ${year}`.replace(/\s+/g, " ").trim();
    });
}
