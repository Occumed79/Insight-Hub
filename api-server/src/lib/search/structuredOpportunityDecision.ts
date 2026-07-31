import type { NormalizedOpportunity } from "../providers/types";
import { classifyProviderRecordRelevance } from "../providers/providerQueryMatch";
import { runLimitedProviderPool } from "../limitedProviderPool";
import { geminiProvider } from "../providers/gemini";
import { groqProvider } from "../providers/groq";
import { openrouterProvider } from "../providers/openrouter";
import { minimaxProvider } from "../providers/minimax";
import { clodProvider } from "../providers/clod";
import {
  cerebrasProvider,
  deepseekProvider,
  mistralProvider,
  nvidiaProvider,
} from "../providers/openAiCompatible";

interface ReviewProvider {
  name: string;
  isConfigured(): Promise<boolean>;
  complete(prompt: string, maxTokens?: number): Promise<string>;
}

export interface StructuredOpportunityDecisionResult {
  approved: NormalizedOpportunity[];
  deterministicApproved: number;
  aiApproved: number;
  rejected: number;
  reviewHeld: number;
  reviewer: string | null;
  diagnostics: string[];
}

interface ReviewVote {
  index: number;
  isOpportunity: boolean;
  relevanceScore: number;
  reason: string;
}

const REVIEW_PROVIDERS: ReviewProvider[] = [
  cerebrasProvider,
  groqProvider,
  openrouterProvider,
  mistralProvider,
  nvidiaProvider,
  minimaxProvider,
  clodProvider,
  geminiProvider,
  deepseekProvider,
];

const DETERMINISTIC_ACCEPT_SCORE = 78;
const AI_ACCEPT_SCORE = 72;
const AMBIGUOUS_MIN_SCORE = 55;
const DEFAULT_REVIEW_LIMIT = 3;
const REVIEW_DESCRIPTION_CHARS = 1_200;
const REVIEW_OUTPUT_TOKENS = 700;

function existingTags(record: NormalizedOpportunity): string[] {
  const tags = record.rawData?.tags;
  return Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];
}

function withDecision(
  record: NormalizedOpportunity,
  method: "deterministic" | "single-ai-review",
  score: number,
  reason: string,
  reviewer?: string,
): NormalizedOpportunity {
  return {
    ...record,
    rawData: {
      ...(record.rawData ?? {}),
      opportunityDecision: "actionable",
      opportunityDecisionMethod: method,
      relevanceScore: score,
      relevanceReason: reason,
      ...(reviewer ? { opportunityReviewer: reviewer } : {}),
      tags: Array.from(
        new Set([
          ...existingTags(record),
          "actionable",
          method === "deterministic"
            ? "deterministic-approved"
            : "single-ai-reviewed",
        ]),
      ),
    },
  };
}

function hasFutureDeadline(record: NormalizedOpportunity, now = Date.now()): boolean {
  return Boolean(
    record.responseDeadline &&
      !Number.isNaN(record.responseDeadline.getTime()) &&
      record.responseDeadline.getTime() > now,
  );
}

export function isDeterministicallyActionable(
  record: NormalizedOpportunity,
  now = Date.now(),
): boolean {
  const relevance = classifyProviderRecordRelevance(record);
  return (
    !relevance.rejected &&
    hasFutureDeadline(record, now) &&
    relevance.score >= DETERMINISTIC_ACCEPT_SCORE &&
    (relevance.confidence === "verified_explicit" ||
      relevance.confidence === "strong_combination")
  );
}

export function structuredReviewCandidateLimit(): number {
  const parsed = Number.parseInt(
    process.env.STRUCTURED_RFP_REVIEW_CANDIDATE_LIMIT ?? "",
    10,
  );
  if (!Number.isFinite(parsed)) return DEFAULT_REVIEW_LIMIT;
  return Math.max(0, Math.min(5, parsed));
}

function stripJson(text: string): string {
  return text
    .replace(/```json\n?/gi, "")
    .replace(/```/g, "")
    .trim();
}

function parseReviewVotes(text: string): ReviewVote[] | null {
  const cleaned = stripJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { results?: unknown[] }).results)
      ? (parsed as { results: unknown[] }).results
      : null;
  if (!rows) return null;

  return rows.flatMap((row, order) => {
    if (!row || typeof row !== "object") return [];
    const object = row as Record<string, unknown>;
    const indexValue = Number(object.index);
    const index = Number.isInteger(indexValue) ? indexValue : order;
    const scoreValue = Number(object.relevanceScore);
    const relevanceScore = Number.isFinite(scoreValue)
      ? Math.max(0, Math.min(100, Math.round(scoreValue)))
      : 0;
    const reason =
      typeof object.reason === "string" && object.reason.trim()
        ? object.reason.trim().slice(0, 400)
        : object.isOpportunity === true
          ? "The purchased scope is an active Occu-Med-compatible procurement."
          : "The record lacks sufficient active Occu-Med procurement evidence.";
    return [
      {
        index,
        isOpportunity: object.isOpportunity === true,
        relevanceScore,
        reason,
      },
    ];
  });
}

function buildReviewPrompt(records: NormalizedOpportunity[]): string {
  const items = records
    .map(
      (record, index) =>
        [
          `[${index}]`,
          `Title: ${record.title}`,
          `Buyer: ${record.agency}`,
          `Notice type: ${record.type}`,
          record.solicitationNumber
            ? `Solicitation: ${record.solicitationNumber}`
            : "",
          record.responseDeadline
            ? `Deadline: ${record.responseDeadline.toISOString()}`
            : "Deadline: unknown",
          `Description: ${(record.description ?? "").slice(0, REVIEW_DESCRIPTION_CHARS)}`,
        ]
          .filter(Boolean)
          .join("\n"),
    )
    .join("\n\n");

  return `You are the single fallback reviewer for Occu-Med procurement discovery.
Today is ${new Date().toISOString().slice(0, 10)}.

Approve only when the PRIMARY PURCHASED SCOPE is a real, currently open procurement for services Occu-Med can perform or coordinate: occupational health, employment or deployment medical examinations, drug/alcohol testing, medical surveillance, audiometry, spirometry, respirator medical evaluation or fit testing, vaccinations, fitness-for-duty evaluations, or provider-network program management.

Reject expired, awarded, cancelled, closed, construction, IT, equipment, pharmaceuticals, treatment-only care, general clinical staffing, insurance administration, grants, jobs, news, and records where medical language is incidental boilerplate. Do not approve an unknown deadline unless the record contains clear evidence that responses are currently being accepted.

Return only JSON in this shape and exactly one row per item:
{"results":[{"index":0,"isOpportunity":true,"relevanceScore":86,"reason":"Core scope purchases employee medical examinations and testing; deadline is open."}]}

ITEMS:
${items}`;
}

async function reviewAmbiguous(
  records: NormalizedOpportunity[],
): Promise<{
  votes: ReviewVote[];
  reviewer: string | null;
  diagnostics: string[];
}> {
  if (records.length === 0) {
    return { votes: [], reviewer: null, diagnostics: [] };
  }

  const result = await runLimitedProviderPool(
    "opportunity-structured-review",
    REVIEW_PROVIDERS.map((provider) => ({
      name: provider.name,
      isConfigured: () => provider.isConfigured(),
      run: async () =>
        parseReviewVotes(
          await provider.complete(buildReviewPrompt(records), REVIEW_OUTPUT_TOKENS),
        ),
    })),
    (votes) => Array.isArray(votes) && votes.length === records.length,
  );

  return {
    votes: result.value ?? [],
    reviewer: result.provider,
    diagnostics:
      result.value && result.provider
        ? result.recoveredErrors
        : result.errors,
  };
}

export async function decideStructuredOpportunities(
  records: NormalizedOpportunity[],
): Promise<StructuredOpportunityDecisionResult> {
  const approved: NormalizedOpportunity[] = [];
  const ambiguous: Array<{
    record: NormalizedOpportunity;
    score: number;
    reason: string;
  }> = [];
  let rejected = 0;

  for (const record of records) {
    const relevance = classifyProviderRecordRelevance(record);
    if (relevance.rejected || relevance.score < AMBIGUOUS_MIN_SCORE) {
      rejected += 1;
      continue;
    }

    if (isDeterministicallyActionable(record)) {
      approved.push(
        withDecision(
          record,
          "deterministic",
          relevance.score,
          relevance.reasons.join("; ") ||
            "Explicit Occu-Med service scope with a future response deadline.",
        ),
      );
      continue;
    }

    ambiguous.push({
      record,
      score: relevance.score,
      reason: relevance.reasons.join("; "),
    });
  }

  ambiguous.sort((left, right) => {
    const scoreDelta = right.score - left.score;
    if (scoreDelta) return scoreDelta;
    const leftDeadline = left.record.responseDeadline?.getTime() ?? Infinity;
    const rightDeadline = right.record.responseDeadline?.getTime() ?? Infinity;
    return leftDeadline - rightDeadline;
  });

  const reviewLimit = structuredReviewCandidateLimit();
  const selected = ambiguous.slice(0, reviewLimit);
  const review = await reviewAmbiguous(selected.map((entry) => entry.record));
  let aiApproved = 0;

  for (const vote of review.votes) {
    const target = selected[vote.index];
    if (!target) continue;
    if (!vote.isOpportunity || vote.relevanceScore < AI_ACCEPT_SCORE) continue;
    approved.push(
      withDecision(
        target.record,
        "single-ai-review",
        vote.relevanceScore,
        vote.reason,
        review.reviewer ?? undefined,
      ),
    );
    aiApproved += 1;
  }

  const reviewHeld = Math.max(0, ambiguous.length - aiApproved);

  return {
    approved,
    deterministicApproved: approved.length - aiApproved,
    aiApproved,
    rejected,
    reviewHeld,
    reviewer: review.reviewer,
    diagnostics: Array.from(new Set(review.diagnostics)).slice(0, 8),
  };
}
