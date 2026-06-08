import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-3-lite";

export class VoyageProvider implements DataSourceProvider {
  readonly name = "voyage" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("voyageApiKey", "VOYAGE_API_KEY");
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

  async embed(texts: string[], inputType: "query" | "document" = "document"): Promise<number[][] | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey || texts.length === 0) return null;

    try {
      const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          input: texts.map((text) => text.slice(0, 4000)),
          input_type: inputType,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) return null;
      const json = (await response.json()) as { data?: { index?: number; embedding?: number[] }[] };
      const data = json.data;
      if (!data?.length) return null;

      const out: (number[] | undefined)[] = new Array(texts.length).fill(undefined);
      for (const item of data) {
        if (typeof item.index === "number" && Array.isArray(item.embedding) && item.index >= 0 && item.index < texts.length) {
          out[item.index] = item.embedding;
        }
      }
      if (out.some((embedding) => embedding === undefined)) return null;
      return out as number[][];
    } catch {
      return null;
    }
  }
}

export const voyageProvider = new VoyageProvider();