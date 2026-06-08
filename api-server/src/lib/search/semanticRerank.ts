/**
 * Semantic Re-Ranking
 *
 * Re-orders the top slice of already-relevance-ranked opportunities by neural
 * relevance. Cohere rerank is used first when configured; otherwise embedding
 * similarity falls back across Jina, Voyage, and Hugging Face.
 *
 * Opt-in and bounded:
 *   - Disabled unless ENABLE_SEMANTIC_RERANK=true.
 *   - Only the top `topN` candidates are scored, so cost/latency are capped.
 *   - Any failure falls back to the original order — ranking never breaks.
 */

import { envFlag } from "../config/env";
import { cohereProvider } from "../providers/cohere";
import { embedTexts } from "./embeddings";

// Describes the kind of opportunity Occu-Med wants to find. Used as the query
// profile that candidate opportunities are scored against.
const IDEAL_PROFILE = [
  "Open government request for proposal or solicitation for occupational health services,",
  "medical screening, drug and alcohol testing, DOT physicals, pre-employment physical exams,",
  "medical surveillance, audiograms, respirator clearance, pulmonary function testing, and",
  "fit-for-duty evaluations. Includes defense-contractor and deployment medical screening,",
  "clinic/provider-network agreements, and federal/state procurement opportunities and bids.",
].join(" ");

const SEMANTIC_BLEND = 25; // max points the semantic component can add to a score
const DEFAULT_TOP_N = 80;

let cachedProfileByProvider = new Map<string, number[]>();

export function isSemanticRerankEnabled(): boolean {
  return envFlag("ENABLE_SEMANTIC_RERANK", false);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function getProfileEmbedding(candidateProvider?: string): Promise<{ provider: string; vector: number[] } | null> {
  if (candidateProvider) {
    const cached = cachedProfileByProvider.get(candidateProvider);
    if (cached) return { provider: candidateProvider, vector: cached };
  }

  const result = await embedTexts([IDEAL_PROFILE], "query");
  if (!result?.vectors[0]) return null;

  cachedProfileByProvider.set(result.provider, result.vectors[0]);
  return { provider: result.provider, vector: result.vectors[0] };
}

export interface SemanticRerankItem<T> {
  item: T;
  /** Current ranking score (e.g. relevance + feedback). */
  baseScore: number;
  /** Text representing the item (title + snippet). */
  text: string;
}

export interface SemanticRerankResult<T> {
  item: T;
  baseScore: number;
  /** Blended score: baseScore + semantic component (0..SEMANTIC_BLEND). */
  rankScore: number;
  /** Similarity/relevance to the ideal profile, 0..1 (null if not scored). */
  similarity: number | null;
}

/**
 * Re-rank `items` (already sorted best-first) by blending semantic relevance
 * into the top `topN`. Returns every item with a computed `rankScore`, sorted
 * best-first. On any failure, returns items in their original order with
 * rankScore = baseScore and similarity = null.
 */
export async function semanticRerank<T>(
  items: SemanticRerankItem<T>[],
  topN: number = DEFAULT_TOP_N
): Promise<SemanticRerankResult<T>[]> {
  const passthrough = (): SemanticRerankResult<T>[] =>
    items.map((it) => ({ item: it.item, baseScore: it.baseScore, rankScore: it.baseScore, similarity: null }));

  if (!isSemanticRerankEnabled() || items.length === 0) return passthrough();

  const head = items.slice(0, topN);
  const tail = items.slice(topN);

  const cohereConfigured = await cohereProvider.isConfigured();
  const cohereScores = cohereConfigured
    ? await cohereProvider.rerank(IDEAL_PROFILE, head.map((h) => h.text), head.length)
    : null;
  if (!cohereConfigured) console.warn("[semanticRerank] Cohere not configured (COHERE_API_KEY missing); trying embeddings.");
  else if (!cohereScores?.length) console.warn("[semanticRerank] Cohere rerank returned no scores (check server logs for HTTP status); trying embeddings.");
  if (cohereScores?.length) {
    const byIndex = new Map(cohereScores.map((score) => [score.index, score.relevanceScore]));
    const rerankedHead: SemanticRerankResult<T>[] = head.map((h, i) => {
      const relevance = Math.max(0, Math.min(1, byIndex.get(i) ?? 0));
      return {
        item: h.item,
        baseScore: h.baseScore,
        rankScore: h.baseScore + relevance * SEMANTIC_BLEND,
        similarity: relevance,
      };
    });
    rerankedHead.sort((a, b) => b.rankScore - a.rankScore);
    return [...rerankedHead, ...tail.map((t) => ({ item: t.item, baseScore: t.baseScore, rankScore: t.baseScore, similarity: null }))];
  }

  const candidateEmbeddings = await embedTexts(head.map((h) => h.text), "document");
  if (!candidateEmbeddings || candidateEmbeddings.vectors.length !== head.length) {
    console.warn("[semanticRerank] Embedding fallback also failed — all 3 providers (Jina/Voyage/HuggingFace) returned no vectors. Falling back to base ranking.");
    return passthrough();
  }

  const profile = await getProfileEmbedding(candidateEmbeddings.provider);
  if (!profile || profile.provider !== candidateEmbeddings.provider) return passthrough();

  const rerankedHead: SemanticRerankResult<T>[] = head.map((h, i) => {
    const sim = cosine(profile.vector, candidateEmbeddings.vectors[i]); // ~ -1..1, typically 0..1 here
    const clamped = Math.max(0, Math.min(1, sim));
    return {
      item: h.item,
      baseScore: h.baseScore,
      rankScore: h.baseScore + clamped * SEMANTIC_BLEND,
      similarity: clamped,
    };
  });

  rerankedHead.sort((a, b) => b.rankScore - a.rankScore);

  const passthroughTail: SemanticRerankResult<T>[] = tail.map((t) => ({
    item: t.item,
    baseScore: t.baseScore,
    rankScore: t.baseScore,
    similarity: null,
  }));

  return [...rerankedHead, ...passthroughTail];
}
