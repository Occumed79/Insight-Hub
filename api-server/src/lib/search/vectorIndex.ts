import { createHash } from "crypto";
import type { NormalizedOpportunity } from "../providers/types";
import { qdrantProvider } from "../providers/qdrant";
import { pineconeProvider } from "../providers/pinecone";
import { embedTexts, type EmbeddingProviderName } from "./embeddings";

export interface VectorIndexStats {
  attempted: number;
  indexed: number;
  provider: string | null;
  vectorStore: "qdrant" | "pinecone" | null;
  errors: string[];
}

export interface VectorIndexDocument {
  id: string;
  text: string;
  payload: Record<string, unknown>;
}

export interface VectorIndexOptions {
  qdrantCollection?: string;
  pineconeNamespace?: string;
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 24;

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
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).flatMap(([key, value]) => {
      if (value === undefined || value === null) return [];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [[key, value]];
      }
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        return [[key, value]];
      }
      return [[key, JSON.stringify(value).slice(0, 2_000)]];
    }),
  );
}

export async function indexVectorDocuments(
  documents: VectorIndexDocument[],
  options: VectorIndexOptions = {},
): Promise<VectorIndexStats> {
  const stats: VectorIndexStats = {
    attempted: documents.length,
    indexed: 0,
    provider: null,
    vectorStore: null,
    errors: [],
  };
  if (documents.length === 0) return stats;

  const batchSize = Math.max(1, Math.min(50, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE)));
  let preferredProvider: EmbeddingProviderName | undefined;
  let selectedStore: "qdrant" | "pinecone" | null = null;

  for (let start = 0; start < documents.length; start += batchSize) {
    const batch = documents.slice(start, start + batchSize);
    const embeddingResult = await embedTexts(
      batch.map((document) => document.text.slice(0, 16_000)),
      "document",
      preferredProvider,
    );
    if (!embeddingResult || embeddingResult.vectors.length !== batch.length) {
      stats.errors.push(`Embedding batch ${Math.floor(start / batchSize) + 1} failed`);
      continue;
    }

    preferredProvider = embeddingResult.provider;
    stats.provider ??= embeddingResult.provider;
    if (embeddingResult.errors?.length) stats.errors.push(...embeddingResult.errors);

    const points = batch.map((document, index) => ({
      id: stableUuid(document.id),
      vector: embeddingResult.vectors[index],
      payload: compactPayload(document.payload),
    }));

    let indexed = false;
    if ((selectedStore === null || selectedStore === "qdrant") && (await qdrantProvider.isConfigured())) {
      const ok = await qdrantProvider.upsert(points, options.qdrantCollection);
      if (ok) {
        selectedStore = "qdrant";
        indexed = true;
      } else {
        stats.errors.push(`Qdrant upsert failed for batch ${Math.floor(start / batchSize) + 1}`);
      }
    }

    if (!indexed && (selectedStore === null || selectedStore === "pinecone") && (await pineconeProvider.isConfigured())) {
      const ok = await pineconeProvider.upsert(points, options.pineconeNamespace);
      if (ok) {
        selectedStore = "pinecone";
        indexed = true;
      } else {
        stats.errors.push(`Pinecone upsert failed for batch ${Math.floor(start / batchSize) + 1}`);
      }
    }

    if (indexed) stats.indexed += points.length;
  }

  stats.vectorStore = selectedStore;
  if (!selectedStore) stats.errors.push("No working vector store was available; indexing was skipped");
  return stats;
}

export async function indexOpportunities(opportunities: NormalizedOpportunity[]): Promise<VectorIndexStats> {
  return indexVectorDocuments(
    opportunities.map((opp) => ({
      id: opp.externalId || `${opp.source}:${opp.title}:${opp.agency}`,
      text: opportunityVectorText(opp),
      payload: {
        documentType: "opportunity",
        externalId: opp.externalId,
        title: opp.title,
        agency: opp.agency,
        source: opp.source,
        sourceUrl: opp.sourceUrl,
        solicitationNumber: opp.solicitationNumber,
        naicsCode: opp.naicsCode,
        status: opp.status,
      },
    })),
  );
}

function stableUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
