import type { NormalizedOpportunity } from "../providers/types";
import { qdrantProvider } from "../providers/qdrant";
import { embedTexts } from "./embeddings";

export interface VectorIndexStats {
  attempted: number;
  indexed: number;
  provider: string | null;
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
  const stats: VectorIndexStats = { attempted: opportunities.length, indexed: 0, provider: null, errors: [] };
  if (opportunities.length === 0) return stats;

  const qdrantConfigured = await qdrantProvider.isConfigured();
  if (!qdrantConfigured) {
    stats.errors.push("Qdrant not configured — vector index skipped");
    return stats;
  }

  const embeddingResult = await embedTexts(opportunities.map(opportunityVectorText), "document");
  if (!embeddingResult) {
    stats.errors.push("No embedding provider available — vector index skipped");
    return stats;
  }

  stats.provider = embeddingResult.provider;
  const points = opportunities.map((opp, index) => ({
    id: stableVectorId(opp.externalId || `${opp.source}:${opp.title}:${opp.agency}`),
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

  const ok = await qdrantProvider.upsert(points);
  if (!ok) {
    stats.errors.push("Qdrant upsert failed");
    return stats;
  }

  stats.indexed = points.length;
  return stats;
}

function stableVectorId(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `opp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
