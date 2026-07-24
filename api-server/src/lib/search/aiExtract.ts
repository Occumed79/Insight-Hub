import { createHash } from "crypto";
import { geminiProvider, OCCUMED_PROFILE } from "../providers/gemini";
import { groqProvider } from "../providers/groq";
import { cerebrasProvider } from "../providers/openAiCompatible";

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
}

export interface BatchExtractResult {
  extractions: (AiExtraction | null)[];
  rateLimited: boolean;
  usedScorers: string[];
  cacheHits: number;
}

interface AiTextProvider {
  name: string;
  isConfigured(): Promise<boolean>;
  complete(prompt: string, maxTokens?: number): Promise<string>;
}

/**
 * Deliberate provider roles. Groq performs the fast first pass, Gemini is the
 * generative fallback, and Cerebras is invoked only for ambiguous accepted
 * records that need deeper validation/normalization.
 */
export const AI_EXTRACTION_PROVIDER_ORDER = ["groq", "gemini"] as const;
const PRIMARY_PROVIDERS: AiTextProvider[] = [groqProvider, geminiProvider];

const CHUNK_SIZE = 8;
const CONTENT_CHARS = 1_400;
const MAX_OUTPUT_TOKENS = 2_048;
const REVIEW_OUTPUT_TOKENS = 1_600;
const CACHE_TTL_MS = 12 * 60 * 60 * 1_000;

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
    .update(input.content.slice(0, 4_000))
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
  return text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
}

/** Parse a JSON array, or an object containing a `results` array. */
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
  } catch {
    // fall through to bounded array slicing
  }
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const sliced = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(sliced) ? sliced : null;
    } catch {
      return null;
    }
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

const ORG_SERVICES = OCCUMED_PROFILE.services.slice(0, 9).join("; ");

function buildBatchPrompt(items: BatchExtractInput[], today: string): string {
  const blocks = items
    .map(
      (item, index) =>
        `[${index}]\nTitle: ${item.title}\nURL: ${item.url}\nContent: ${item.content.slice(0, CONTENT_CHARS)}`,
    )
    .join("\n\n");

  return `You are the fast first-pass procurement intelligence analyst for Occu-Med.
Occu-Med services: ${ORG_SERVICES}.
Today's date: ${today}

For EACH indexed item, decide whether it is a CURRENTLY OPEN solicitation/RFP that Occu-Med could bid on.
Reject news coverage, awards, expired/closed notices, jobs, regulations, unrelated healthcare, and pages without evidence that proposals are currently accepted.

Return ONLY a JSON array in the same order. Every object must include index and isOpportunity.
For accepted items include title, agency, description, deadline (YYYY-MM-DD or null), estimatedValue, location, relevanceScore (0-100), and relevanceReason.
For rejected items include a specific reason.

ITEMS:
${blocks}`;
}

export function shouldEscalateToCerebras(
  extraction: AiExtraction,
): boolean {
  if (!extraction.isOpportunity) return false;
  const score = extraction.relevanceScore ?? 0;
  return (
    score < 75 ||
    !extraction.deadline ||
    !extraction.agency?.trim() ||
    (extraction.description?.trim().length ?? 0) < 100
  );
}

function buildValidationPrompt(
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
        `[${localIndex}]
ORIGINAL TITLE: ${input.title}
URL: ${input.url}
CONTENT: ${input.content.slice(0, 2_400)}
PRELIMINARY VERDICT: ${JSON.stringify(preliminary)}`,
    )
    .join("\n\n");

  return `You are the bounded validation layer for Occu-Med procurement intelligence.
Today's date: ${today}.
Review only the ambiguous preliminary ACCEPT decisions below. Correct false positives, normalize dates and agencies, and preserve an acceptance only when the page itself supports an open procurement for Occu-Med services.

Return ONLY JSON as {"results":[...]}. Each result must include index, isOpportunity, relevanceScore, validationReason, and all corrected fields. Use isOpportunity:false when evidence is insufficient, stale, awarded, expired, or unrelated.

${blocks}`;
}

interface ProviderAttemptResult {
  rows: unknown[] | null;
  scorer: string | null;
  rateLimited: boolean;
}

async function runPrimaryBatch(
  prompt: string,
): Promise<ProviderAttemptResult> {
  let rateLimited = false;
  for (const provider of PRIMARY_PROVIDERS) {
    try {
      if (!(await provider.isConfigured())) continue;
      const text = await provider.complete(prompt, MAX_OUTPUT_TOKENS);
      const rows = parseJsonArray(text);
      if (rows) return { rows, scorer: provider.name, rateLimited };
    } catch (error) {
      if (isRateLimit(error)) rateLimited = true;
    }
  }
  return { rows: null, scorer: null, rateLimited };
}

async function validateWithCerebras(
  reviewItems: Array<{
    localIndex: number;
    input: BatchExtractInput;
    preliminary: AiExtraction;
  }>,
  today: string,
): Promise<{ rows: unknown[] | null; rateLimited: boolean }> {
  if (reviewItems.length === 0 || !(await cerebrasProvider.isConfigured())) {
    return { rows: null, rateLimited: false };
  }
  try {
    const text = await cerebrasProvider.complete(
      buildValidationPrompt(reviewItems, today),
      REVIEW_OUTPUT_TOKENS,
    );
    return { rows: parseJsonArray(text), rateLimited: false };
  } catch (error) {
    return { rows: null, rateLimited: isRateLimit(error) };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export async function extractOpportunitiesBatch(
  inputs: BatchExtractInput[],
): Promise<BatchExtractResult> {
  const extractions: (AiExtraction | null)[] = new Array(inputs.length).fill(null);
  const usedScorers = new Set<string>();
  let rateLimited = false;
  let cacheHits = 0;

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
    };
  }

  const today = new Date().toISOString().split("T")[0] ?? "";

  for (const group of chunk(pending, CHUNK_SIZE)) {
    const primary = await runPrimaryBatch(
      buildBatchPrompt(
        group.map((entry) => entry.input),
        today,
      ),
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
      .filter(([, extraction]) => shouldEscalateToCerebras(extraction))
      .map(([localIndex, preliminary]) => ({
        localIndex,
        input: group[localIndex]!.input,
        preliminary,
      }));

    const review = await validateWithCerebras(reviewItems, today);
    if (review.rateLimited) rateLimited = true;
    if (review.rows?.length) {
      usedScorers.add("cerebras");
      review.rows.forEach((raw, order) => {
        if (!raw || typeof raw !== "object") return;
        const object = raw as Record<string, unknown>;
        const localIndex =
          typeof object.index === "number"
            ? object.index
            : reviewItems[order]?.localIndex;
        if (
          typeof localIndex !== "number" ||
          !provisional.has(localIndex)
        ) {
          return;
        }
        const corrected = extractionFromObject(raw, primary.scorer ?? "unknown");
        if (!corrected) return;
        corrected.validatedBy = "cerebras";
        corrected.validationReason =
          typeof object.validationReason === "string"
            ? object.validationReason
            : undefined;
        corrected.winnerScorer = `${primary.scorer}+cerebras`;
        provisional.set(localIndex, corrected);
      });
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
  };
}

export function clearExtractionCache(): void {
  extractionCache.clear();
}
