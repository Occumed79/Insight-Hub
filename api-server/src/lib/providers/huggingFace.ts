import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const HF_FEATURE_EXTRACTION_URL = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2";

function meanPool(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return null;

  // API may return a single vector for one input, or token vectors. Accept both.
  if (raw.every((value) => typeof value === "number")) return raw as number[];

  if (raw.every((row) => Array.isArray(row))) {
    const rows = raw as unknown[][];
    if (rows.every((row) => row.every((value) => typeof value === "number"))) {
      const vectors = rows as number[][];
      const dims = vectors[0]?.length ?? 0;
      if (dims === 0) return null;
      const pooled = new Array(dims).fill(0);
      for (const vector of vectors) {
        for (let i = 0; i < dims; i++) pooled[i] += vector[i] ?? 0;
      }
      return pooled.map((value) => value / vectors.length);
    }
  }

  return null;
}

export class HuggingFaceProvider implements DataSourceProvider {
  readonly name = "huggingFace" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("huggingFaceApiKey", "HUGGINGFACE_API_KEY");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  async embed(texts: string[]): Promise<number[][] | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey || texts.length === 0) return null;

    const vectors: number[][] = [];
    for (const text of texts) {
      try {
        const response = await fetch(HF_FEATURE_EXTRACTION_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: text.slice(0, 4000), options: { wait_for_model: true } }),
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          console.warn(`[HuggingFace embed] HTTP ${response.status}: ${body.slice(0, 200)}`);
          return null;
        }
        const vector = meanPool(await response.json());
        if (!vector) return null;
        vectors.push(vector);
      } catch (err) {
        console.warn(`[HuggingFace embed] ${err instanceof Error ? err.message : err}`);
        return null;
      }
    }

    return vectors;
  }
}

export const huggingFaceProvider = new HuggingFaceProvider();