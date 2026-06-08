import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const COHERE_BASE = "https://api.cohere.com/v2";
const DEFAULT_RERANK_MODEL = "rerank-english-v3.0";

export interface CohereRerankResult {
  index: number;
  relevanceScore: number;
}

export class CohereProvider implements DataSourceProvider {
  readonly name = "cohere" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("cohereApiKey", "COHERE_API_KEY");
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

  /**
   * Rerank candidate opportunity text against an ideal query/profile.
   * Returns index-aligned scores from 0..1, sorted by Cohere's relevance order.
   */
  async rerank(query: string, documents: string[], topN = documents.length): Promise<CohereRerankResult[] | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey || documents.length === 0) return null;

    try {
      const response = await fetch(`${COHERE_BASE}/rerank`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: DEFAULT_RERANK_MODEL,
          query,
          documents: documents.map((text) => text.slice(0, 4000)),
          top_n: Math.min(topN, documents.length),
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.warn(`[Cohere rerank] HTTP ${response.status}: ${body.slice(0, 200)}`);
        return null;
      }

      const json = (await response.json()) as {
        results?: { index?: number; relevance_score?: number }[];
      };

      if (!json.results?.length) return null;
      return json.results
        .filter((result) => typeof result.index === "number")
        .map((result) => ({
          index: result.index as number,
          relevanceScore: typeof result.relevance_score === "number" ? result.relevance_score : 0,
        }));
    } catch (err) {
      console.warn(`[Cohere rerank] ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}

export const cohereProvider = new CohereProvider();