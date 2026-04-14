/**
 * Multi-Scorer Engine
 *
 * Runs Gemini, Groq, and OpenRouter in parallel to score each opportunity candidate.
 * Uses a consensus/union approach: if ANY scorer says it's relevant (score >= threshold),
 * the result is kept. Each scorer's verdict is stored for transparency in the UI.
 *
 * Scoring modes:
 *  - "consensus": ALL scorers must agree (strictest)
 *  - "majority":  majority must agree (default)
 *  - "union":     ANY scorer says yes → keep it (most permissive)
 */

import { geminiProvider } from "../providers/gemini";
import { groqProvider } from "../providers/groq";
import { openrouterProvider } from "../providers/openrouter";
import { OCCUMED_PROFILE } from "../providers/gemini";

export type ScoringMode = "consensus" | "majority" | "union";

export interface ScorerVote {
  scorer: string;
  score: number;
  explanation: string;
  passed: boolean;
}

export interface MultiScorerResult {
  finalScore: number;       // average of passing scorers
  votes: ScorerVote[];
  passed: boolean;
  winnerScorer: string;     // which scorer gave the highest score
}

const ORG_CONTEXT = `${OCCUMED_PROFILE.name}: ${OCCUMED_PROFILE.services.slice(0, 6).join(", ")}. Serves ${OCCUMED_PROFILE.clientTypes.slice(0, 4).join(", ")}.`;

const MIN_INDIVIDUAL_SCORE = 55;   // a scorer's score must be >= this to "vote yes"
const FINAL_PASS_SCORE = 50;        // final averaged score must be >= this

/**
 * Score a single opportunity using all available AI scorers in parallel.
 * Mode controls how votes are combined.
 */
export async function scoreWithMultipleAIs(
  title: string,
  description: string,
  mode: ScoringMode = "union"
): Promise<MultiScorerResult> {
  const [geminiResult, groqResult, openrouterResult] = await Promise.allSettled([
    geminiProvider.scoreRelevance(title, description, ORG_CONTEXT).catch(() => null),
    groqProvider.scoreRelevance(title, description, ORG_CONTEXT).catch(() => null),
    openrouterProvider.scoreRelevance(title, description, ORG_CONTEXT).catch(() => null),
  ]);

  const votes: ScorerVote[] = [];

  const addVote = (name: string, result: PromiseSettledResult<{score: number; explanation: string} | null>) => {
    if (result.status === "fulfilled" && result.value) {
      votes.push({
        scorer: name,
        score: result.value.score,
        explanation: result.value.explanation,
        passed: result.value.score >= MIN_INDIVIDUAL_SCORE,
      });
    }
    // If scorer failed/unavailable: simply omit — don't penalize
  };

  addVote("gemini", geminiResult);
  addVote("groq", groqResult);
  addVote("openrouter", openrouterResult);

  if (votes.length === 0) {
    // All scorers failed — default pass with low score so we don't silently drop things
    return {
      finalScore: 40,
      votes: [],
      passed: true,
      winnerScorer: "fallback",
    };
  }

  const passing = votes.filter((v) => v.passed);
  const best = votes.reduce((a, b) => (a.score > b.score ? a : b));

  let passed = false;
  switch (mode) {
    case "consensus":
      passed = passing.length === votes.length;
      break;
    case "majority":
      passed = passing.length > votes.length / 2;
      break;
    case "union":
    default:
      passed = passing.length >= 1;
      break;
  }

  const avgScore = Math.round(
    votes.reduce((sum, v) => sum + v.score, 0) / votes.length
  );

  return {
    finalScore: avgScore,
    votes,
    passed: passed && avgScore >= FINAL_PASS_SCORE,
    winnerScorer: best.scorer,
  };
}

/**
 * Full extraction using multiple AIs in parallel, union mode.
 * Returns the best extraction result (highest relevanceScore).
 */
export async function extractWithMultipleAIs(
  title: string,
  url: string,
  content: string
): Promise<{
  isOpportunity: boolean;
  title?: string;
  agency?: string;
  description?: string;
  deadline?: string | null;
  estimatedValue?: number | null;
  location?: string | null;
  relevanceScore?: number;
  relevanceReason?: string;
  scorerVotes?: ScorerVote[];
  winnerScorer?: string;
  reason?: string;
} | null> {
  const [geminiResult, groqResult] = await Promise.allSettled([
    geminiProvider.extractOpportunityFromWebResult(title, url, content).catch(() => null),
    groqProvider.extractOpportunityFromWebResult(title, url, content).catch(() => null),
  ]);

  const results: Array<{
    scorer: string;
    data: NonNullable<Awaited<ReturnType<typeof geminiProvider.extractOpportunityFromWebResult>>>;
  }> = [];

  if (geminiResult.status === "fulfilled" && geminiResult.value?.isOpportunity) {
    results.push({ scorer: "gemini", data: geminiResult.value });
  }
  if (groqResult.status === "fulfilled" && groqResult.value?.isOpportunity) {
    results.push({ scorer: "groq", data: groqResult.value });
  }

  if (results.length === 0) {
    // Check if any said "not an opportunity" with a reason
    const anyResult =
      (geminiResult.status === "fulfilled" && geminiResult.value) ||
      (groqResult.status === "fulfilled" && groqResult.value);
    if (anyResult && !anyResult.isOpportunity) {
      return { isOpportunity: false, reason: (anyResult as {reason?: string}).reason ?? "Not an opportunity" };
    }
    return null;
  }

  // Pick best result: highest relevanceScore wins; merge fields from others if missing
  results.sort((a, b) => (b.data.relevanceScore ?? 0) - (a.data.relevanceScore ?? 0));
  const best = results[0];

  // Merge: fill missing fields from runner-up
  const merged = { ...best.data };
  for (const r of results.slice(1)) {
    if (!merged.agency && r.data.agency) merged.agency = r.data.agency;
    if (!merged.deadline && r.data.deadline) merged.deadline = r.data.deadline;
    if (!merged.estimatedValue && r.data.estimatedValue) merged.estimatedValue = r.data.estimatedValue;
    if (!merged.location && r.data.location) merged.location = r.data.location;
    if (!merged.description && r.data.description) merged.description = r.data.description;
  }

  // Build votes for UI transparency
  const votes: ScorerVote[] = results.map((r) => ({
    scorer: r.scorer,
    score: r.data.relevanceScore ?? 50,
    explanation: r.data.relevanceReason ?? "",
    passed: (r.data.relevanceScore ?? 0) >= MIN_INDIVIDUAL_SCORE,
  }));

  return {
    ...merged,
    scorerVotes: votes,
    winnerScorer: best.scorer,
  };
}
