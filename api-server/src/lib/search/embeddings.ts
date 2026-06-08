import { jinaProvider } from "../providers/jina";
import { voyageProvider } from "../providers/voyage";
import { huggingFaceProvider } from "../providers/huggingFace";

export type EmbeddingInputType = "query" | "document";

export interface EmbeddingResult {
  provider: "jina" | "voyage" | "huggingFace";
  vectors: number[][];
  /** Errors from providers that were tried but failed (for diagnostics). */
  errors?: string[];
}

/**
 * Try Jina → Voyage → HuggingFace in order. Return the first successful
 * result along with any errors collected from earlier providers.
 */
export async function embedTexts(texts: string[], inputType: EmbeddingInputType = "document"): Promise<EmbeddingResult | null> {
  if (texts.length === 0) return null;

  const normalized = texts.map((text) => text.slice(0, 4000));
  const errors: string[] = [];

  // --- Jina ---
  const jinaConfigured = await jinaProvider.isConfigured();
  if (jinaConfigured) {
    const jinaTask = inputType === "query" ? "retrieval.query" : "retrieval.passage";
    const jinaVectors = await jinaProvider.embed(normalized, jinaTask);
    if (validVectors(jinaVectors, texts.length)) return { provider: "jina", vectors: jinaVectors, errors };
    errors.push("Jina: embed returned no valid vectors (check server logs for HTTP status)");
  } else {
    errors.push("Jina: not configured (JINA_API_KEY missing)");
  }

  // --- Voyage ---
  const voyageConfigured = await voyageProvider.isConfigured();
  if (voyageConfigured) {
    const voyageVectors = await voyageProvider.embed(normalized, inputType);
    if (validVectors(voyageVectors, texts.length)) return { provider: "voyage", vectors: voyageVectors, errors };
    errors.push("Voyage: embed returned no valid vectors (check server logs for HTTP status)");
  } else {
    errors.push("Voyage: not configured (VOYAGE_API_KEY missing)");
  }

  // --- HuggingFace ---
  const hfConfigured = await huggingFaceProvider.isConfigured();
  if (hfConfigured) {
    const huggingFaceVectors = await huggingFaceProvider.embed(normalized);
    if (validVectors(huggingFaceVectors, texts.length)) return { provider: "huggingFace", vectors: huggingFaceVectors, errors };
    errors.push("HuggingFace: embed returned no valid vectors (check server logs for HTTP status)");
  } else {
    errors.push("HuggingFace: not configured (HUGGINGFACE_API_KEY missing)");
  }

  console.warn(`[embedTexts] All embedding providers failed: ${errors.join("; ")}`);
  return null;
}

function validVectors(vectors: number[][] | null, expectedLength: number): vectors is number[][] {
  return !!vectors && vectors.length === expectedLength && vectors.every((vector) => Array.isArray(vector) && vector.length > 0);
}
