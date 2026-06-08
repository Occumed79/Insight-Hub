/**
 * Semantic Re-Ranking
 *
 * Re-orders the top slice of already-relevance-ranked opportunities by neural
 * embedding similarity to an "ideal Occu-Med opportunity" profile, blended with
 * the existing keyword/heuristic score. This catches on-topic results whose
 * wording doesn't literally contain the keyword list.
 *
 * Opt-in and bounded:
 *   - Disabled unless ENABLE_SEMANTIC_RERANK=true and Jina is configured.
 *   - Only the top `topN` candidates are embedded (one batched Jina call), so
 *     cost/latency are capped regardless of result-set size.
 *   - The ideal-profile embedding is computed once and cached in-memory.
 *   - Any failure (no key, API error, length mismatch) falls back to the
 *     original order — ranking never breaks.
 */

import { jinaProvider } from "../providers/jina";
import { envFlag } from "../config/env";

// Describes the kind of opportunity Occu-Med wants to find. Used as the query
// vector that candidate opportunities are scored against.
const IDEAL_PROFILE = [
  "Open government request for proposal or solicitation for occupational health services,",
  "medical screening, drug and alcohol testing, DOT physicals, pre-employment physical exams,",
  "medical surveillance, audiograms, respirator clearance, pulmonary function testing, and",
  "fit-for-duty evaluations. Includes defense-contractor and deployment medical screening,",
  "clinic/provider-network agreements, and federal/state procurement opportunities and bids.",
].join(" ");

const SEMANTIC_BLEND = 25; // max points the semantic component can add to a score
const DEFAULT_TOP_N = 80;

let cachedProfile: number[] | null = null;

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

async function getProfileEmbedding(): Promise<number[] | null> {
  if (cachedProfile) return cachedProfile;
  const vecs = await jinaProvider.embed([IDEAL_PROFILE], "retrieval.query");
  if (!vecs?.[0]) return null;
  cachedProfile = vecs[0];
  return cachedProfile;
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
  /** Cosine similarity to the ideal profile, 0..1 (null if not scored). */
  similarity: number | null;
}

/**
 * Re-rank `items` (already sorted best-first) by blending semantic similarity
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

  const profile = await getProfileEmbedding();
  if (!profile) return passthrough();

  const head = items.slice(0, topN);
  const tail = items.slice(topN);

  const vectors = await jinaProvider.embed(head.map((h) => h.text), "retrieval.passage");
  if (!vectors || vectors.length !== head.length) return passthrough();

  const rerankedHead: SemanticRerankResult<T>[] = head.map((h, i) => {
    const sim = cosine(profile, vectors[i]); // ~ -1..1, typically 0..1 here
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