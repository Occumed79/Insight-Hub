import { jinaProvider } from "../providers/jina";
import { voyageProvider } from "../providers/voyage";
import { huggingFaceProvider } from "../providers/huggingFace";

export type EmbeddingInputType = "query" | "document";

export interface EmbeddingResult {
  provider: "jina" | "voyage" | "huggingFace";
  vectors: number[][];
}

export async function embedTexts(texts: string[], inputType: EmbeddingInputType = "document"): Promise<EmbeddingResult | null> {
  if (texts.length === 0) return null;

  const normalized = texts.map((text) => text.slice(0, 4000));

  const jinaTask = inputType === "query" ? "retrieval.query" : "retrieval.passage";
  const jinaVectors = await jinaProvider.embed(normalized, jinaTask);
  if (validVectors(jinaVectors, texts.length)) return { provider: "jina", vectors: jinaVectors };

  const voyageVectors = await voyageProvider.embed(normalized, inputType);
  if (validVectors(voyageVectors, texts.length)) return { provider: "voyage", vectors: voyageVectors };

  const huggingFaceVectors = await huggingFaceProvider.embed(normalized);
  if (validVectors(huggingFaceVectors, texts.length)) return { provider: "huggingFace", vectors: huggingFaceVectors };

  return null;
}

function validVectors(vectors: number[][] | null, expectedLength: number): vectors is number[][] {
  return !!vectors && vectors.length === expectedLength && vectors.every((vector) => Array.isArray(vector) && vector.length > 0);
}
