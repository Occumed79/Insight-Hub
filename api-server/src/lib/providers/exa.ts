/**
 * Exa Provider
 *
 * Role: Neural search engine optimized for AI use cases. Finds semantically
 * relevant results across the web — better at understanding intent than keyword
 * search. Supports "deep" multi-query search with structured output extraction
 * and full-page content retrieval.
 *
 * API docs: https://docs.exa.ai
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const EXA_BASE = "https://api.exa.ai";

export interface ExaResult {
  id: string;
  url: string;
  title: string;
  score?: number;
  publishedDate?: string;
  author?: string;
  highlights?: string[];
  text?: string;
}

export interface ExaSearchResponse {
  results: ExaResult[];
  resolvedSearchType?: string;
}

export class ExaProvider implements DataSourceProvider {
  readonly name = "exa" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("exaApiKey", "EXA_API_KEY");
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

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Exa API key not configured.");

    const response = await fetch(`${EXA_BASE}${path}`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Exa error ${response.status}: ${text.slice(0, 200)}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search the web using Exa's neural search. Returns results with highlights.
   * type: "auto" for most queries, "deep" for thorough research (4-12s).
   */
  async search(
    query: string,
    options: {
      numResults?: number;
      type?: "auto" | "fast" | "deep" | "deep-reasoning";
      maxHighlightChars?: number;
      startPublishedDate?: string;
      includeDomains?: string[];
      excludeDomains?: string[];
      category?: "news" | "research paper" | "company" | "people";
    } = {}
  ): Promise<ExaResult[]> {
    const {
      numResults = 10,
      type = "auto",
      maxHighlightChars = 4000,
      startPublishedDate,
      includeDomains,
      excludeDomains,
      category,
    } = options;

    const body: Record<string, unknown> = {
      query,
      num_results: numResults,
      type,
      contents: { highlights: { max_characters: maxHighlightChars } },
    };

    if (startPublishedDate) body["startPublishedDate"] = startPublishedDate;
    if (includeDomains?.length) body["includeDomains"] = includeDomains;
    if (excludeDomains?.length) body["excludeDomains"] = excludeDomains;
    if (category) body["category"] = category;

    const data = await this.request<ExaSearchResponse>("/search", body);
    return data.results ?? [];
  }

  /**
   * Search with full text content (for RAG / deep analysis).
   */
  async searchWithContent(
    query: string,
    numResults = 5,
    maxChars = 10000
  ): Promise<ExaResult[]> {
    const body: Record<string, unknown> = {
      query,
      num_results: numResults,
      type: "deep",
      contents: { text: { max_characters: maxChars } },
    };

    const data = await this.request<ExaSearchResponse>("/search", body);
    return data.results ?? [];
  }

  /**
   * Get full content for known URLs.
   */
  async getContents(urls: string[], maxChars = 10000): Promise<ExaResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return [];

    const response = await fetch(`${EXA_BASE}/contents`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        urls,
        text: { max_characters: maxChars },
      }),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { results?: ExaResult[] };
    return data.results ?? [];
  }

  /**
   * Run multiple search queries in parallel and deduplicate by URL.
   */
  async searchMultiple(queries: string[], numPerQuery = 8): Promise<ExaResult[]> {
    const batches = await Promise.allSettled(
      queries.map((q) => this.search(q, { numResults: numPerQuery }))
    );

    const seen = new Set<string>();
    const results: ExaResult[] = [];

    for (const b of batches) {
      if (b.status === "fulfilled") {
        for (const r of b.value) {
          if (r.url && !seen.has(r.url)) {
            seen.add(r.url);
            results.push(r);
          }
        }
      }
    }

    return results;
  }

  /**
   * Find active RFPs and procurement opportunities for Occu-Med via neural search.
   */
  async findOpportunities(keywords?: string): Promise<ExaResult[]> {
    const year = new Date().getFullYear();
    const queries = keywords
      ? [
          `${keywords} RFP solicitation government contract ${year}`,
          `${keywords} bid procurement open ${year}`,
        ]
      : [
          `occupational health services RFP government contract ${year}`,
          `employee health drug testing solicitation open ${year}`,
          `DOT physical occupational medicine government bid ${year}`,
        ];

    return this.searchMultiple(queries, 10);
  }
}

export const exaProvider = new ExaProvider();
