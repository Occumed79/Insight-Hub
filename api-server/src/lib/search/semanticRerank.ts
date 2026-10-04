import { envFlag } from "../config/env";
import { cloudflareWorkersAi } from "../providers/cloudflareWorkersAi";
import { cohereProvider } from "../providers/cohere";
import { embedTexts, type EmbeddingProviderName } from "./embeddings";
import { runLimitedProviderPool } from "../limitedProviderPool";
import { getRelevanceProfile, type RelevanceProfile } from "./relevanceProfile";
import { profileClientTypes, profileServiceLabels } from "./profileText";

/**
 * Describes the kind of opportunity Occu-Med wants to find, rendered from the Neon relevance profile on every call
 * (service lines and buyer types are profile rows; the profile can refresh while the process runs).
 */
export function occumedSemanticProfile(profile: RelevanceProfile = getRelevanceProfile()): string {
  const services = profileServiceLabels(profile);
  const buyers = profileClientTypes(profile);
  return [
    `Open government request for proposal or solicitation for: ${services.join("; ")}.`,
    buyers.length ? `Buyers include ${buyers.join("; ")}.` : "",
    "Includes federal, state, local, and international procurement opportunities.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The Occu-Med semantic profile string, with an optional search focus appended. */
export async function getOccuMedSemanticProfile(focus?: string): Promise<string> {
  const base = occumedSemanticProfile();
  const normalized = focus?.trim();
  return normalized ? `${base} Current search focus: ${normalized}.` : base;
}

const SEMANTIC_BLEND = 25;
const DEFAULT_TOP_N = 80;
const cachedProfileBySpace = new Map<string, number[]>();

export function isSemanticRerankEnabled(): boolean {
  const configuredByEnvironment = Boolean(
    (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) ||
    process.env.GEMINI_API_KEY,
  );
  return envFlag("ENABLE_SEMANTIC_RERANK", configuredByEnvironment);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Async version that fetches the live profile from the reference model. */
async function semanticQueryAsync(focus?: string): Promise<string> {
  return getOccuMedSemanticProfile(focus);
}

async function getProfileEmbedding(
  provider: EmbeddingProviderName,
  query: string,
): Promise<number[] | null> {
  const cacheKey = `${provider}:${query}`;
  const cached = cachedProfileBySpace.get(cacheKey);
  if (cached) return cached;

  // Pin the profile to the same provider/model space used for documents.
  const result = await embedTexts([query], "query", provider);
  const vector = result?.vectors[0];
  if (!vector || result.provider !== provider) return null;
  cachedProfileBySpace.set(cacheKey, vector);
  return vector;
}

export interface SemanticRerankItem<T> {
  item: T;
  baseScore: number;
  text: string;
}

export interface SemanticRerankResult<T> {
  item: T;
  baseScore: number;
  rankScore: number;
  similarity: number | null;
}

function passthrough<T>(
  items: SemanticRerankItem<T>[],
): SemanticRerankResult<T>[] {
  return items.map((entry) => ({
    item: entry.item,
    baseScore: entry.baseScore,
    rankScore: entry.baseScore,
    similarity: null,
  }));
}

function mergeScores<T>(
  head: SemanticRerankItem<T>[],
  tail: SemanticRerankItem<T>[],
  scoreByIndex: Map<number, number>,
): SemanticRerankResult<T>[] {
  const rerankedHead = head.map((entry, index) => {
    const similarity = Math.max(0, Math.min(1, scoreByIndex.get(index) ?? 0));
    return {
      item: entry.item,
      baseScore: entry.baseScore,
      rankScore: entry.baseScore + similarity * SEMANTIC_BLEND,
      similarity,
    };
  });
  rerankedHead.sort((left, right) => right.rankScore - left.rankScore);
  return [
    ...rerankedHead,
    ...tail.map((entry) => ({
      item: entry.item,
      baseScore: entry.baseScore,
      rankScore: entry.baseScore,
      similarity: null,
    })),
  ];
}

/**
 * Re-rank a bounded top slice without ever making ranking availability a hard
 * dependency. Provider order is Cloudflare direct reranker, Cohere (legacy),
 * then embeddings through Cloudflare → Gemini → existing fallbacks.
 */
export async function semanticRerank<T>(
  items: SemanticRerankItem<T>[],
  topN: number = DEFAULT_TOP_N,
  focus?: string,
): Promise<SemanticRerankResult<T>[]> {
  if (!isSemanticRerankEnabled() || items.length === 0)
    return passthrough(items);

  const head = items.slice(0, topN);
  const tail = items.slice(topN);
  const query = await semanticQueryAsync(focus);

  const directRerank = await runLimitedProviderPool(
    "opportunity-semantic-rerank",
    [
      {
        name: "cloudflare",
        isConfigured: () => cloudflareWorkersAi.isConfigured(),
        run: async () => {
          const scores = await cloudflareWorkersAi.rerank(
            query,
            head.map((entry) => entry.text),
          );
          return new Map(
            (scores ?? []).map((score) => [score.index, score.score]),
          );
        },
      },
      {
        name: "cohere",
        isConfigured: () => cohereProvider.isConfigured(),
        run: async () => {
          const scores = await cohereProvider.rerank(
            query,
            head.map((entry) => entry.text),
            head.length,
          );
          return new Map(
            (scores ?? []).map((score) => [score.index, score.relevanceScore]),
          );
        },
      },
    ],
    (scores) => scores.size > 0,
  );
  if (directRerank.value) {
    return mergeScores(head, tail, directRerank.value);
  }
  if (directRerank.errors.length > 0) {
    console.warn(
      `[semanticRerank] Direct rerank providers failed: ${directRerank.errors.join("; ")}`,
    );
  }

  const documentEmbeddings = await embedTexts(
    head.map((entry) => entry.text),
    "document",
  );
  if (
    !documentEmbeddings ||
    documentEmbeddings.vectors.length !== head.length
  ) {
    console.warn(
      "[semanticRerank] All semantic providers failed; using deterministic ranking.",
    );
    return passthrough(items);
  }

  const profile = await getProfileEmbedding(documentEmbeddings.provider, query);
  if (!profile) return passthrough(items);

  return mergeScores(
    head,
    tail,
    new Map(
      documentEmbeddings.vectors.map((vector, index) => [
        index,
        Math.max(0, Math.min(1, cosine(profile, vector))),
      ]),
    ),
  );
}

export function clearSemanticProfileCache(): void {
  cachedProfileBySpace.clear();
}
