import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const DEFAULT_NAMESPACE = process.env.PINECONE_NAMESPACE || "opportunities";

type PineconePoint = {
  id: string;
  vector: number[];
  payload?: Record<string, unknown>;
};

export interface PineconeSearchHit {
  id: string;
  score: number;
  payload?: Record<string, unknown>;
}

export class PineconeProvider implements DataSourceProvider {
  readonly name = "pinecone" as const;

  private async getConfig(): Promise<{ apiKey: string; host: string } | null> {
    const apiKey = await resolveCredential("pineconeApiKey", "PINECONE_API_KEY");
    const host = await resolveCredential("pineconeIndexHost", "PINECONE_INDEX_HOST");
    if (!apiKey || !host) return null;
    return { apiKey, host: host.replace(/\/$/, "") };
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getConfig());
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const config = await this.getConfig();
    if (!config) return { name: this.name, configured: false, healthy: false };

    try {
      const response = await fetch(`${config.host}/describe_index_stats`, {
        method: "POST",
        headers: {
          "Api-Key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10000),
      });
      return { name: this.name, configured: true, healthy: response.ok };
    } catch (error) {
      return {
        name: this.name,
        configured: true,
        healthy: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async upsert(points: PineconePoint[], namespace = DEFAULT_NAMESPACE): Promise<boolean> {
    const config = await this.getConfig();
    if (!config || points.length === 0) return false;

    try {
      const response = await fetch(`${config.host}/vectors/upsert`, {
        method: "POST",
        headers: {
          "Api-Key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace,
          vectors: points.map((point) => ({
            id: point.id,
            values: point.vector,
            metadata: point.payload,
          })),
        }),
        signal: AbortSignal.timeout(20000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(vector: number[], limit = 10, namespace = DEFAULT_NAMESPACE): Promise<PineconeSearchHit[] | null> {
    const config = await this.getConfig();
    if (!config || vector.length === 0) return null;

    try {
      const response = await fetch(`${config.host}/query`, {
        method: "POST",
        headers: {
          "Api-Key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          namespace,
          vector,
          topK: limit,
          includeMetadata: true,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return null;
      const json = (await response.json()) as { matches?: { id?: string; score?: number; metadata?: Record<string, unknown> }[] };
      return (json.matches ?? []).map((hit) => ({
        id: hit.id ?? "",
        score: typeof hit.score === "number" ? hit.score : 0,
        payload: hit.metadata,
      })).filter((hit) => hit.id);
    } catch {
      return null;
    }
  }
}

export const pineconeProvider = new PineconeProvider();
