import { createHash } from "crypto";
import type { NormalizedOpportunity } from "../providers/types";
import { qdrantProvider } from "../providers/qdrant";
import { pineconeProvider } from "../providers/pinecone";
import { embedTexts } from "./embeddings";

export interface VectorIndexStats {
  attempted: number;
  indexed: number;
  provider: string | null;
  vectorStore: "qdrant" | "pinecone" | null;
  errors: string[];
}

export function opportunityVectorText(opp: NormalizedOpportunity): string {
  return [
    opp.title,
    opp.agency,
    opp.subAgency,
    opp.type,
    opp.naicsCode,
    opp.naicsDescription,
    opp.setAside,
    opp.placeOfPerformance,
    opp.description,
    opp.solicitationNumber,
  ].filter(Boolean).join("\n").slice(0, 4000);
}

export async function indexOpportunities(opportunities: NormalizedOpportunity[]): Promise<VectorIndexStats> {
  const stats: VectorIndexStats = { attempted: opportunities.length, indexed: 0, provider: null, vectorStore: null, errors: [] };
  if (opportunities.length === 0) return stats;

  const embeddingResult = await embedTexts(opportunities.map(opportunityVectorText), "document");
  if (!embeddingResult) {
    stats.errors.push("No embedding provider available — vector index skipped. All 3 providers (Jina/Voyage/HuggingFace) failed — check Render server logs for [Jina embed] / [Voyage embed] / [HuggingFace embed] HTTP error details.");
    return stats;
  }
  if (embeddingResult.errors?.length) {
    stats.errors.push(...embeddingResult.errors);
  }

  stats.provider = embeddingResult.provider;
  const points = opportunities.map((opp, index) => ({
    id: stableUuid(opp.externalId || `${opp.source}:${opp.title}:${opp.agency}`),
    vector: embeddingResult.vectors[index],
    payload: {
      externalId: opp.externalId,
      title: opp.title,
      agency: opp.agency,
      source: opp.source,
      sourceUrl: opp.sourceUrl,
      solicitationNumber: opp.solicitationNumber,
      naicsCode: opp.naicsCode,
      status: opp.status,
    },
  }));

  if (await qdrantProvider.isConfigured()) {
    const ok = await qdrantProvider.upsert(points);
    if (ok) {
      stats.indexed = points.length;
      stats.vectorStore = "qdrant";
      return stats;
    }
    stats.errors.push("Qdrant upsert failed");
  }

  if (await pineconeProvider.isConfigured()) {
    const ok = await pineconeProvider.upsert(points);
    if (ok) {
      stats.indexed = points.length;
      stats.vectorStore = "pinecone";
      return stats;
    }
    stats.errors.push("Pinecone upsert failed");
  }

  if (!stats.vectorStore) stats.errors.push("No vector store configured — vector index skipped");
  return stats;
}

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
