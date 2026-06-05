/**
 * Batched AI extraction with caching and provider round-robin.
 *
 * Replaces the previous "one AI call per candidate, three providers in parallel"
 * approach (which burned ~3x the quota and tripped rate limits, forcing almost
 * everything into the heuristic fallback). Instead:
 *
 *  1. Batching      — many candidates are analyzed in a single prompt returning a
 *                     JSON array, cutting AI calls by ~CHUNK_SIZE x.
 *  2. Caching       — extractions are memoized by URL hash so re-runs of the same
 *                     opportunity don't re-spend quota.
 *  3. Round-robin   — a single ordered set of providers (Gemini → Groq →
 *                     OpenRouter → Minimax) is tried per chunk; on a rate limit or
 *                     failure we fail over to the next provider instead of giving up.
 */

import { createHash } from "crypto";
import { geminiProvider, OCCUMED_PROFILE } from "../providers/gemini";
import { groqProvider } from "../providers/groq";
import { openrouterProvider } from "../providers/openrouter";
import { minimaxProvider } from "../providers/minimax";

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
  reason?: string;
}

export interface BatchExtractInput {
  title: string;
  url: string;
  content: string;
}

export interface BatchExtractResult {
  /** Extraction per input, aligned by index. null = no AI verdict (caller should fall back). */
  extractions: (AiExtraction | null)[];
  rateLimited: boolean;
  /** Providers that successfully answered at least one chunk. */
  usedScorers: string[];
  cacheHits: number;
}

/** Minimal text-completion surface shared by all four AI providers. */
interface AiTextProvider {
  name: string;
  isConfigured(): Promise<boolean>;
  complete(prompt: string, maxTokens?: number): Promise<string>;
}

const PROVIDER_ORDER: AiTextProvider[] = [
  geminiProvider,
  groqProvider,
  openrouterProvider,
  minimaxProvider,
];

/** How many candidates to analyze in a single AI prompt. */
const CHUNK_SIZE = 8;
/** Max characters of page content sent per candidate (keeps the batch prompt bounded). */
const CONTENT_CHARS = 1100;
/** Output token budget for a full chunk's JSON array. */
const MAX_OUTPUT_TOKENS = 2048;
/** Cache TTL — long enough to dedupe quota across repeated fetches, short enough to refresh. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface CacheEntry {
  value: AiExtraction;
  expires: number;
}

const extractionCache = new Map<string, CacheEntry>();

function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 20);
}

function getCached(url: string): AiExtraction | undefined {
  const entry = extractionCache.get(cacheKey(url));
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    extractionCache.delete(cacheKey(url));
    return undefined;
  }
  return entry.value;
}

function setCached(url: string, value: AiExtraction): void {
  extractionCache.set(cacheKey(url), { value, expires: Date.now() + CACHE_TTL_MS });
}

/** True if an error indicates the provider is rate limited / out of quota. */
function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /QUOTA_EXCEEDED|RATE_LIMITED|\b429\b|rate limit/i.test(msg);
}

function stripJson(text: string): string {
  return text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
}

/** Extract the first JSON array from a model response, tolerant of surrounding prose. */
function parseJsonArray(text: string): unknown[] | null {
  const cleaned = stripJson(text);
  try {
    const direct = JSON.parse(cleaned);
    if (Array.isArray(direct)) return direct;
  } catch {
    // fall through to bracket slicing
  }
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const sliced = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(sliced)) return sliced;
    } catch {
      // give up
    }
  }
  return null;
}

const ORG_SERVICES = OCCUMED_PROFILE.services.slice(0, 7).join("; ");

function buildBatchPrompt(items: BatchExtractInput[], today: string): string {
  const blocks = items
    .map(
      (it, i) =>
        `[${i}]\nTitle: ${it.title}\nURL: ${it.url}\nContent: ${it.content.slice(0, CONTENT_CHARS)}`
    )
    .join("\n\n");

  return `You are a strict procurement intelligence analyst for Occu-Med (an occupational health services company).
Occu-Med services: ${ORG_SERVICES}.
Today's date: ${today}

You will be given ${items.length} web result(s), each marked with a numeric [index]. For EACH item decide with HIGH CONFIDENCE whether it is a CURRENTLY OPEN solicitation/RFP that Occu-Med could bid on right now.

Return isOpportunity:false for an item if ANY of these apply:
1. It is a news article reporting on an RFP, not the actual solicitation posting.
2. The deadline/due date has already passed (compare to ${today}).
3. The title/content contains "awarded", "award notice", "contract award", or "selected vendor".
4. It is a job posting, career page, or employment ad.
5. There is no clear evidence the solicitation is currently accepting proposals.
6. The services have nothing to do with occupational health, medical exams, drug testing, or employee health.
7. It is a government regulation, policy, or federal register notice (not a bid).

Respond with ONLY a JSON array — one object per input item, in the SAME order, each including its "index":
[
  {"index":0,"isOpportunity":true,"title":"exact solicitation title","agency":"procuring organization","description":"specific services being procured (2-3 sentences)","deadline":"YYYY-MM-DD or null","estimatedValue":number or null,"location":"city, state or null","relevanceScore":0-100,"relevanceReason":"one sentence on Occu-Med fit"},
  {"index":1,"isOpportunity":false,"reason":"specific reason"}
]

ITEMS:
${blocks}`;
}

let roundRobinStart = 0;

interface RoundRobinResult {
  text: string | null;
  scorer: string | null;
  rateLimited: boolean;
}

/**
 * Run a single prompt against the provider chain, rotating the starting provider
 * each call and failing over on errors / rate limits. Returns the raw text plus
 * which provider answered; text is null if every configured provider failed.
 */
async function runWithRoundRobin(prompt: string, maxTokens: number): Promise<RoundRobinResult> {
  const n = PROVIDER_ORDER.length;
  const offset = roundRobinStart++ % n;
  let rateLimited = false;

  for (let i = 0; i < n; i++) {
    const provider = PROVIDER_ORDER[(offset + i) % n];
    try {
      if (!(await provider.isConfigured())) continue;
      const text = await provider.complete(prompt, maxTokens);
      if (text && text.trim()) return { text, scorer: provider.name, rateLimited };
    } catch (err) {
      if (isRateLimit(err)) rateLimited = true;
      // try the next provider
    }
  }
  return { text: null, scorer: null, rateLimited };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Extract structured opportunity data for many candidates using batched AI calls,
 * memoized by URL. Results are aligned by input index; a null entry means no AI
 * provider produced a verdict (caller should apply its heuristic fallback).
 */
export async function extractOpportunitiesBatch(
  inputs: BatchExtractInput[]
): Promise<BatchExtractResult> {
  const extractions: (AiExtraction | null)[] = new Array(inputs.length).fill(null);
  const usedScorers = new Set<string>();
  let rateLimited = false;
  let cacheHits = 0;

  // 1. Serve from cache where possible; collect the rest for batched AI calls.
  const pending: { input: BatchExtractInput; index: number }[] = [];
  inputs.forEach((input, index) => {
    const cached = getCached(input.url);
    if (cached) {
      extractions[index] = cached;
      cacheHits++;
    } else {
      pending.push({ input, index });
    }
  });

  if (pending.length === 0) {
    return { extractions, rateLimited, usedScorers: [...usedScorers], cacheHits };
  }

  const today = new Date().toISOString().split("T")[0];

  // 2. Batched extraction with provider round-robin, one prompt per chunk.
  for (const group of chunk(pending, CHUNK_SIZE)) {
    const prompt = buildBatchPrompt(group.map((g) => g.input), today);
    const res = await runWithRoundRobin(prompt, MAX_OUTPUT_TOKENS);
    if (res.rateLimited) rateLimited = true;
    if (!res.text || !res.scorer) continue; // every provider failed → heuristic fallback

    usedScorers.add(res.scorer);
    const parsed = parseJsonArray(res.text);
    if (!parsed) continue;
    const scorer = res.scorer;

    // Map each returned object back to its candidate by declared index (fallback to order).
    parsed.forEach((raw, order) => {
      if (!raw || typeof raw !== "object") return;
      const obj = raw as Record<string, unknown>;
      const localIdx =
        typeof obj.index === "number" && obj.index >= 0 && obj.index < group.length
          ? obj.index
          : order;
      const target = group[localIdx];
      if (!target) return;

      const extraction: AiExtraction = {
        isOpportunity: obj.isOpportunity === true,
        title: typeof obj.title === "string" ? obj.title : undefined,
        agency: typeof obj.agency === "string" ? obj.agency : undefined,
        description: typeof obj.description === "string" ? obj.description : undefined,
        deadline: typeof obj.deadline === "string" ? obj.deadline : null,
        estimatedValue: typeof obj.estimatedValue === "number" ? obj.estimatedValue : null,
        location: typeof obj.location === "string" ? obj.location : null,
        relevanceScore: typeof obj.relevanceScore === "number" ? obj.relevanceScore : undefined,
        relevanceReason: typeof obj.relevanceReason === "string" ? obj.relevanceReason : undefined,
        reason: typeof obj.reason === "string" ? obj.reason : undefined,
        winnerScorer: scorer,
      };
      extractions[target.index] = extraction;
      setCached(target.input.url, extraction);
    });
  }

  return { extractions, rateLimited, usedScorers: [...usedScorers], cacheHits };
}

/** Test/maintenance helper — clears the in-memory extraction cache. */
export function clearExtractionCache(): void {
  extractionCache.clear();
}
