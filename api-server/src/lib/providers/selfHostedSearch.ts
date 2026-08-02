/**
 * Self-Hosted Search Index Provider (Meilisearch/Typesense)
 *
 * Role: Provide search capabilities using a self-hosted search engine instead of
 * external search APIs. This eliminates API key dependencies and rate limits.
 *
 * Benefits:
 * - No API keys required
 * - No rate limits
 * - Full control over search behavior
 * - Can be scaled horizontally
 * - Works offline
 * - Privacy (data stays local)
 *
 * Supports:
 * - Meilisearch (https://www.meilisearch.com)
 * - Typesense (https://typesense.org)
 * - Any OpenSearch/Elasticsearch-compatible server
 */

import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 100;

export interface SearchResult {
  id: string;
  title: string;
  url?: string;
  description?: string;
  agency?: string;
  state?: string;
  score?: number;
  [key: string]: any;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  filters?: string;
  sort?: string[];
  timeout?: number;
}

export class SelfHostedSearchProvider implements DataSourceProvider {
  readonly name = "selfHostedSearch" as const;

  private async getSearchEndpoint(): Promise<string | null> {
    return resolveCredential("selfHostedSearchEndpoint", "SELF_HOSTED_SEARCH_ENDPOINT");
  }

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("selfHostedSearchApiKey", "SELF_HOSTED_SEARCH_API_KEY");
  }

  private async getIndexName(): Promise<string> {
    const index = await resolveCredential("selfHostedSearchIndex", "SELF_HOSTED_SEARCH_INDEX");
    return index ?? "opportunities";
  }

  async isConfigured(): Promise<boolean> {
    const endpoint = await this.getSearchEndpoint();
    return !!endpoint;
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    let healthy = configured;
    
    if (configured) {
      try {
        const endpoint = await this.getSearchEndpoint();
        const response = await fetch(`${endpoint}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        healthy = response.ok;
      } catch {
        healthy = false;
      }
    }
    
    return { name: this.name, configured, healthy };
  }

  /**
   * Search the self-hosted index.
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const endpoint = await this.getSearchEndpoint();
    if (!endpoint) throw new Error("Self-hosted search endpoint not configured");

    const apiKey = await this.getApiKey();
    const indexName = await this.getIndexName();
    const limit = options.limit ?? DEFAULT_LIMIT;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // Meilisearch-compatible search API
    const response = await fetch(`${endpoint}/indexes/${indexName}/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        q: options.query,
        limit,
        offset: options.offset ?? 0,
        filter: options.filters,
        sort: options.sort,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Search error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const json = await response.json() as {
      hits?: SearchResult[];
      estimatedTotalHits?: number;
    };

    return json.hits ?? [];
  }

  /**
   * Index a document in the self-hosted search engine.
   */
  async indexDocument(document: Record<string, any>): Promise<string> {
    const endpoint = await this.getSearchEndpoint();
    if (!endpoint) throw new Error("Self-hosted search endpoint not configured");

    const apiKey = await this.getApiKey();
    const indexName = await this.getIndexName();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${endpoint}/indexes/${indexName}/documents`, {
      method: "POST",
      headers,
      body: JSON.stringify([document]),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Index error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const json = await response.json() as {
      taskUid?: number;
    };

    return json.taskUid?.toString() ?? "unknown";
  }

  /**
   * Bulk index multiple documents.
   */
  async indexDocuments(documents: Record<string, any>[]): Promise<string> {
    const endpoint = await this.getSearchEndpoint();
    if (!endpoint) throw new Error("Self-hosted search endpoint not configured");

    const apiKey = await this.getApiKey();
    const indexName = await this.getIndexName();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${endpoint}/indexes/${indexName}/documents`, {
      method: "POST",
      headers,
      body: JSON.stringify(documents),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Bulk index error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const json = await response.json() as {
      taskUid?: number;
    };

    return json.taskUid?.toString() ?? "unknown";
  }

  /**
   * Delete a document from the index.
   */
  async deleteDocument(id: string): Promise<void> {
    const endpoint = await this.getSearchEndpoint();
    if (!endpoint) throw new Error("Self-hosted search endpoint not configured");

    const apiKey = await this.getApiKey();
    const indexName = await this.getIndexName();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${endpoint}/indexes/${indexName}/documents/${id}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Delete error ${response.status}: ${errorText.slice(0, 200)}`);
    }
  }

  /**
   * Create an index with specified configuration.
   */
  async createIndex(indexName: string, primaryKey?: string): Promise<void> {
    const endpoint = await this.getSearchEndpoint();
    if (!endpoint) throw new Error("Self-hosted search endpoint not configured");

    const apiKey = await this.getApiKey();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const body: Record<string, any> = {
      uid: indexName,
    };

    if (primaryKey) {
      body.primaryKey = primaryKey;
    }

    const response = await fetch(`${endpoint}/indexes`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok && response.status !== 409) {
      // 409 = index already exists, which is fine
      const errorText = await response.text().catch(() => "");
      throw new Error(`Create index error ${response.status}: ${errorText.slice(0, 200)}`);
    }
  }
}

export const selfHostedSearchProvider = new SelfHostedSearchProvider();
