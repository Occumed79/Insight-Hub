import { createHash } from "crypto";
import { geminiProvider, OCCUMED_PROFILE } from "../providers/gemini";
import { groqProvider } from "../providers/groq";
import { openrouterProvider } from "../providers/openrouter";
import { minimaxProvider } from "../providers/minimax";
import { clodProvider } from "../providers/clod";
import { localLlmProvider } from "../providers/localLlm";
import {
  cerebrasProvider,
  deepseekProvider,
  mistralProvider,
  nvidiaProvider,
} from "../providers/openAiCompatible";
import { prioritizeCandidatesWithCloudflare } from "./candidateSemanticPriority";
import { runLimitedProviderPool } from "../limitedProviderPool";

export interface AiExtraction {
  isOpportunity: boolean;
  title?: string;
  agency?: string;
  description?: string;
  deadline?: string | null;
  estimatedValue?: number | null;
  location?: string | null;
  relevanceScore?: number;
  relevanceReason?: string;
  winnerScorer?: string;
  validatedBy?: string;
  validationReason?: string;
  reason?: string;
}

export interface BatchExtractInput {
  title: string;
  url: string;
  content: string;
  sourceProvider?: string;
  cloudflareSemanticScore?: number;
  cloudflareSemanticRank?: number;
}

export interface BatchExtractResult {
  extractions: (AiExtraction | null)[];
  rateLimited: boolean;
  usedScorers: string[];
  cacheHits: number;
  cloudflarePrioritized: boolean;
  cloudflareEmbedded: number;
  cloudflareDirectReranked: number;
  cloudflareDuplicatesRemoved: number;
  cloudflareAiBudgetDeferred: number;
  cloudflareErrors: string[];
}

interface AiTextProvider {
  name: string;
  isConfigured(): Promise<boolean>;
  complete(prompt: string, maxTokens?: number): Promise<string>;
}

/**
 * Local LLM (Tier 1 - Most Stable) is prioritized as it has no API keys and no rate limits.
 * Cerebras has the largest available working quota among external APIs, so it is the normal path
 * rather than an edge-case reviewer. Cloudflare Workers AI now orders and
 * trims the uncached candidate pool before Cerebras receives it. Groq and
 * Gemini preserve continuity only when Cerebras is unavailable, rate-limited,
 * or returns malformed output.
 */
export const AI_EXTRACTION_PROVIDER_ORDER = [
  "local-llm",
  "cloudflare-workers-ai",
  "cerebras",
  "groq",
  "gemini",
  "openrouter",
  "mistral",
  "deepseek",
  "nvidia",
  "minimax",
  "clod",
] as const;

const PRIMARY_PROVIDERS: AiTextProvider[] = [
  // Wrap localLlmProvider to match AiTextProvider interface
  {
    name: "local-llm",
    isConfigured: () => localLlmProvider.isConfigured(),
    complete: (prompt: string, maxTokens?: number) => localLlmProvider.complete(prompt, { maxTokens }),
  },
  cerebrasProvider,
  groqProvider,
  geminiProvider,
  openrouterProvider,
  mistralProvider,
  deepseekProvider,
  nvidiaProvider,
  minimaxProvider,
  clodProvider,
];

const CROSS_CHECK_PROVIDERS: AiTextProvider[] = [
  {
    name: "local-llm",
    isConfigured: () => localLlmProvider.isConfigured(),
    complete: (prompt: string, maxTokens?: number) => localLlmProvider.complete(prompt, { maxTokens }),
  },
  groqProvider,
  geminiProvider,
  openrouterProvider,
  mistralProvider,
  deepseekProvider,
  nvidiaProvider,
  minimaxProvider,
  clodProvider,
];
const CHUNK_SIZE = 10;
const CONTENT_CHARS = 2_200;
const MAX_OUTPUT_TOKENS = 3_000;
const REVIEW_OUTPUT_TOKENS = 1_800;
const CACHE_TTL_MS = 12 * 60 * 60 * 1_000;
const DEFAULT_AI_CANDIDATE_LIMIT = 240;

interface CacheEntry {
  value: AiExtraction;
  expires: number;
}

const extractionCache = new Map<string, CacheEntry>();

function cacheKey(input: BatchExtractInput): string {
  return createHash("sha256")
    .update(input.url)
    .update("\n")
    .update(input.title)
    .update("\n")
    .update(input.content.slice(0, 6_000))
    .digest("hex")
    .slice(0, 24);
}

function getCached(input: BatchExtractInput): AiExtraction | undefined {
  const key = cacheKey(input);
  const entry = extractionCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    extractionCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(input: BatchExtractInput, value: AiExtraction): void {
  extractionCache.set(cacheKey(input), {
    value,
    expires: Date.now() + CACHE_TTL_MS,
  });
}

function isRateLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /QUOTA_EXCEEDED|RATE_LIMITED|\b429\b|rate limit/i.test(message);
}

function stripJson(text: string): string {
  return text
    .replace(/```json\n?/g, "")
    .replace(/```/g, "")
    .trim();
}

function parseJsonArray(text: string): unknown[] | null {
  const cleaned = stripJson(text);
  try {
    const direct = JSON.parse(cleaned) as unknown;
    if (Array.isArray(direct)) return direct;
    if (
      direct &&
      typeof direct === "object" &&
      Array.isArray((direct as { results?: unknown[] }).results)
    ) {
      return (direct as { results: unknown[] }).results;
    }
  } catch {}

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : null;
    } catch {}
  }
  return null;
}

function numberOrUndefined(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function extractionFromObject(
  raw: unknown,
  scorer: string,
): AiExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const object = raw as Record<string, unknown>;
  return {
    isOpportunity: object.isOpportunity === true,
    title: typeof object.title === "string" ? object.title : undefined,
    agency: typeof object.agency === "string" ? object.agency : undefined,
    description:
      typeof object.description === "string" ? object.description : undefined,
    deadline: typeof object.deadline === "string" ? object.deadline : null,
    estimatedValue: numberOrUndefined(object.estimatedValue) ?? null,
    location: typeof object.location === "string" ? object.location : null,
    relevanceScore: numberOrUndefined(object.relevanceScore),
    relevanceReason:
      typeof object.relevanceReason === "string"
        ? object.relevanceReason
        : undefined,
    reason: typeof object.reason === "string" ? object.reason : undefined,
    winnerScorer: scorer,
  };
}

const ORG_SERVICES = OCCUMED_PROFILE.services.join("; ");

function buildBatchPrompt(items: BatchExtractInput[], today: string): string {
  const blocks = items
    .map((item, index) => {
      const semantic =
        item.cloudflareSemanticScore == null
          ? "unavailable"
          : `${item.cloudflareSemanticScore.toFixed(2)}/100 (rank ${item.cloudflareSemanticRank ?? "?"})`;
      return `[${index}]\nTitle: ${item.title}\nURL: ${item.url}\nCloudflare semantic priority: ${semantic}\nContent: ${item.content.slice(0, CONTENT_CHARS)}`;
    })
    .join("\n\n");

  return `You are the primary procurement intelligence engine for Occu-Med.
Occu-Med services: ${ORG_SERVICES}.
Today's date: ${today}.

Cloudflare Workers AI has already semantically prioritized this batch. Its score is supporting evidence only; independently verify the page itself.

Analyze EVERY indexed item. Determine whether it is a CURRENTLY OPEN procurement opportunity that Occu-Med could realistically pursue. Understand semantic equivalents such as workforce health, employee medical surveillance, pre-placement examinations, respiratory protection programs, audiometric conservation, deployment medical screening, occupational testing, and provider-network administration.

Reject awards, expired or closed notices, news coverage, jobs, regulations, unrelated clinical care, insurance administration, generic staffing, and pages without evidence that proposals are currently accepted.

Return ONLY a JSON array in the same order. Every object must include index and isOpportunity.
Accepted objects must include title, agency, description, deadline (YYYY-MM-DD or null), estimatedValue, location, relevanceScore (0-100), and relevanceReason.
Rejected objects must include a specific reason.

ITEMS:
${blocks}`;
}

export function shouldCrossCheckExtraction(extraction: AiExtraction): boolean {
  if (!extraction.isOpportunity) return false;
  const score = extraction.relevanceScore ?? 0;
  return (
    score < 68 ||
    !extraction.agency?.trim() ||
    (extraction.description?.trim().length ?? 0) < 80
  );
}

/** Backward-compatible export retained for existing callers/tests. */
export const shouldEscalateToCerebras = shouldCrossCheckExtraction;

function buildCrossCheckPrompt(
  items: Array<{
    localIndex: number;
    input: BatchExtractInput;
    preliminary: AiExtraction;
  }>,
  today: string,
): string {
  const blocks = items
    .map(
      ({ localIndex, input, preliminary }) =>
        `[${localIndex}]\nTITLE: ${input.title}\nURL: ${input.url}\nCONTENT: ${input.content.slice(0, 2_000)}\nPRIMARY VERDICT: ${JSON.stringify(preliminary)}`,
    )
    .join("\n\n");

  return `Cross-check the following ambiguous ACCEPT decisions from the primary procurement analysis.
Today: ${today}.
Return ONLY {"results":[...]}. Preserve an acceptance only when the source supports a currently open procurement relevant to Occu-Med. Correct dates, agency names, descriptions, and scores. Each result must include index, isOpportunity, relevanceScore, validationReason, and corrected fields.

${blocks}`;
}

interface ProviderAttemptResult {
  rows: unknown[] | null;
  scorer: string | null;
  rateLimited: boolean;
}

async function runProviderChain(
  providers: AiTextProvider[],
  prompt: string,
  maxTokens: number,
  skipProvider?: string,
): Promise<ProviderAttemptResult> {
  const result = await runLimitedProviderPool(
    "opportunity-ai-extraction",
    providers
      .filter((provider) => provider.name !== skipProvider)
      .map((provider) => ({
        name: provider.name,
        isConfigured: () => provider.isConfigured(),
        run: async () =>
          parseJsonArray(await provider.complete(prompt, maxTokens)),
      })),
    (rows) => Array.isArray(rows),
  );
  return {
    rows: result.value,
    scorer: result.provider,
    rateLimited: result.errors.some((error) => isRateLimit(error)),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function sourceKey(input: BatchExtractInput): string {
  if (input.sourceProvider?.trim()) return input.sourceProvider.trim();
  try {
    return new URL(input.url).hostname.replace(/^www\./, "") || "unknown";
  } catch {
    return "unknown";
  }
}

function aiCandidateLimit(): number {
  const configured = Number.parseInt(
    process.env.WEB_INTELLIGENCE_AI_CANDIDATE_LIMIT ?? "",
    10,
  );
  if (!Number.isFinite(configured)) return DEFAULT_AI_CANDIDATE_LIMIT;
  return Math.max(20, Math.min(500, configured));
}

export async function extractOpportunitiesBatch(
  inputs: BatchExtractInput[],
): Promise<BatchExtractResult> {
  const extractions: (AiExtraction | null)[] = new Array(inputs.length).fill(
    null,
  );
  const usedScorers = new Set<string>();
  let rateLimited = false;
  let cacheHits = 0;
  let cloudflarePrioritized = false;
  let cloudflareEmbedded = 0;
  let cloudflareDirectReranked = 0;
  let cloudflareDuplicatesRemoved = 0;
  let cloudflareAiBudgetDeferred = 0;
  let cloudflareErrors: string[] = [];

  const pending: Array<{ input: BatchExtractInput; index: number }> = [];
  inputs.forEach((input, index) => {
    const cached = getCached(input);
    if (cached) {
      extractions[index] = cached;
      cacheHits += 1;
    } else {
      pending.push({ input, index });
    }
  });

  if (pending.length === 0) {
    return {
      extractions,
      rateLimited,
      usedScorers: [...usedScorers],
      cacheHits,
      cloudflarePrioritized,
      cloudflareEmbedded,
      cloudflareDirectReranked,
      cloudflareDuplicatesRemoved,
      cloudflareAiBudgetDeferred,
      cloudflareErrors,
    };
  }

  let prioritizedPending = pending;
  const semantic = await prioritizeCandidatesWithCloudflare(
    pending.map((entry) => ({
      ...entry.input,
      sourceProvider: sourceKey(entry.input),
      originalIndex: entry.index,
    })),
    undefined,
    aiCandidateLimit(),
  );

  cloudflarePrioritized = semantic.applied;
  cloudflareEmbedded = semantic.embedded;
  cloudflareDirectReranked = semantic.directReranked;
  cloudflareDuplicatesRemoved = semantic.duplicatesRemoved;
  cloudflareErrors = semantic.errors;
  cloudflareAiBudgetDeferred = Math.max(
    0,
    pending.length - semantic.candidates.length,
  );

  if (semantic.applied) {
    usedScorers.add("cloudflare-workers-ai");
    prioritizedPending = semantic.candidates.map((candidate) => ({
      index: candidate.originalIndex,
      input: {
        title: candidate.title,
        url: candidate.url,
        content: candidate.content,
        sourceProvider: candidate.sourceProvider,
        cloudflareSemanticScore: candidate.cloudflareSemanticScore,
        cloudflareSemanticRank: candidate.cloudflareSemanticRank,
      },
    }));
  }

  const today = new Date().toISOString().split("T")[0] ?? "";

  for (const group of chunk(prioritizedPending, CHUNK_SIZE)) {
    const primary = await runProviderChain(
      PRIMARY_PROVIDERS,
      buildBatchPrompt(
        group.map((entry) => entry.input),
        today,
      ),
      MAX_OUTPUT_TOKENS,
    );
    if (primary.rateLimited) rateLimited = true;
    if (!primary.rows || !primary.scorer) continue;
    usedScorers.add(primary.scorer);

    const provisional = new Map<number, AiExtraction>();
    primary.rows.forEach((raw, order) => {
      if (!raw || typeof raw !== "object") return;
      const object = raw as Record<string, unknown>;
      const localIndex =
        typeof object.index === "number" &&
        object.index >= 0 &&
        object.index < group.length
          ? object.index
          : order;
      if (!group[localIndex]) return;
      const extraction = extractionFromObject(raw, primary.scorer ?? "unknown");
      if (extraction) provisional.set(localIndex, extraction);
    });

    const reviewItems = [...provisional.entries()]
      .filter(([, extraction]) => shouldCrossCheckExtraction(extraction))
      .map(([localIndex, preliminary]) => ({
        localIndex,
        input: group[localIndex]!.input,
        preliminary,
      }));

    if (reviewItems.length > 0) {
      const reviewers =
        primary.scorer === "cerebras"
          ? CROSS_CHECK_PROVIDERS
          : [cerebrasProvider, ...CROSS_CHECK_PROVIDERS];
      const review = await runProviderChain(
        reviewers,
        buildCrossCheckPrompt(reviewItems, today),
        REVIEW_OUTPUT_TOKENS,
        primary.scorer,
      );
      if (review.rateLimited) rateLimited = true;
      if (review.rows?.length && review.scorer) {
        const reviewerName = review.scorer;
        usedScorers.add(reviewerName);
        review.rows.forEach((raw, order) => {
          if (!raw || typeof raw !== "object") return;
          const object = raw as Record<string, unknown>;
          const localIndex =
            typeof object.index === "number"
              ? object.index
              : reviewItems[order]?.localIndex;
          if (typeof localIndex !== "number" || !provisional.has(localIndex)) {
            return;
          }
          const corrected = extractionFromObject(
            raw,
            primary.scorer ?? "unknown",
          );
          if (!corrected) return;
          corrected.validatedBy = reviewerName;
          corrected.validationReason =
            typeof object.validationReason === "string"
              ? object.validationReason
              : undefined;
          corrected.winnerScorer = `${primary.scorer}+${reviewerName}`;
          provisional.set(localIndex, corrected);
        });
      }
    }

    for (const [localIndex, extraction] of provisional) {
      const target = group[localIndex];
      if (!target) continue;
      extractions[target.index] = extraction;
      setCached(target.input, extraction);
    }
  }

  return {
    extractions,
    rateLimited,
    usedScorers: [...usedScorers],
    cacheHits,
    cloudflarePrioritized,
    cloudflareEmbedded,
    cloudflareDirectReranked,
    cloudflareDuplicatesRemoved,
    cloudflareAiBudgetDeferred,
    cloudflareErrors,
  };
}

export function clearExtractionCache(): void {
  extractionCache.clear();
}
