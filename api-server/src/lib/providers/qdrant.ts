import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const DEFAULT_COLLECTION = process.env.QDRANT_COLLECTION || "insight_hub_opportunities";

type QdrantPoint = {
  id: string;
  vector: number[];
  payload?: Record<string, unknown>;
};

export interface VectorSearchHit {
  id: string;
  score: number;
  payload?: Record<string, unknown>;
}

export class QdrantProvider implements DataSourceProvider {
  readonly name = "qdrant" as const;

  private async getConfig(): Promise<{ url: string; apiKey: string } | null> {
    const url = await resolveCredential("qdrantUrl", "QDRANT_URL");
    const apiKey = await resolveCredential("qdrantApiKey", "QDRANT_API_KEY");
    if (!url || !apiKey) return null;
    return { url: url.replace(/\/$/, ""), apiKey };
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
      const response = await fetch(`${config.url}/collections`, {
        headers: { "api-key": config.apiKey },
        signal: AbortSignal.timeout(10_000),
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

  async ensureCollection(vectorSize: number, collectionName = DEFAULT_COLLECTION): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) return false;
    const collectionUrl = `${config.url}/collections/${encodeURIComponent(collectionName)}`;

    try {
      const existing = await fetch(collectionUrl, {
        headers: { "api-key": config.apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (existing.ok) {
        const payload = (await existing.json().catch(() => ({}))) as {
          result?: { config?: { params?: { vectors?: { size?: number } } } };
        };
        const existingSize = payload.result?.config?.params?.vectors?.size;
        return existingSize === undefined || existingSize === vectorSize;
      }
      if (existing.status !== 404) return false;

      const created = await fetch(collectionUrl, {
        method: "PUT",
        headers: {
          "api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vectors: { size: vectorSize, distance: "Cosine" } }),
        signal: AbortSignal.timeout(15_000),
      });
      return created.ok || created.status === 409;
    } catch {
      return false;
    }
  }

  async upsert(points: QdrantPoint[], collectionName = DEFAULT_COLLECTION): Promise<boolean> {
    const config = await this.getConfig();
    if (!config || points.length === 0) return false;

    const vectorSize = points[0]?.vector.length;
    if (!vectorSize || !(await this.ensureCollection(vectorSize, collectionName))) return false;

    try {
      const response = await fetch(`${config.url}/collections/${encodeURIComponent(collectionName)}/points?wait=true`, {
        method: "PUT",
        headers: {
          "api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ points }),
        signal: AbortSignal.timeout(20_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async search(vector: number[], limit = 10, collectionName = DEFAULT_COLLECTION): Promise<VectorSearchHit[] | null> {
    const config = await this.getConfig();
    if (!config || vector.length === 0) return null;

    try {
      const response = await fetch(`${config.url}/collections/${encodeURIComponent(collectionName)}/points/search`, {
        method: "POST",
        headers: {
          "api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ vector, limit, with_payload: true }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return null;
      const json = (await response.json()) as { result?: { id?: string | number; score?: number; payload?: Record<string, unknown> }[] };
      return (json.result ?? []).map((hit) => ({
        id: String(hit.id ?? ""),
        score: typeof hit.score === "number" ? hit.score : 0,
        payload: hit.payload,
      })).filter((hit) => hit.id);
    } catch {
      return null;
    }
  }
}

export const qdrantProvider = new QdrantProvider();
