/**
 * Tavily Provider (AI Research API)
 *
 * Role: Deep web research — finds and surfaces RFPs, procurement signals,
 * and competitive intelligence with high-quality, AI-curated content.
 * Tavily is optimized for AI consumption and returns longer, more relevant content
 * than standard Google search snippets.
 *
 * API docs: https://docs.tavily.com/
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const TAVILY_BASE = "https://api.tavily.com/search";
const TAVILY_EXTRACT = "https://api.tavily.com/extract";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export class TavilyProvider implements DataSourceProvider {
  readonly name = "tavily" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("tavilyApiKey", "TAVILY_API_KEY");
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
   * Run a single deep research query using Tavily's AI search.
   * Returns structured results with full content (not just snippets).
   */
  async research(query: string, maxResults: number = 5): Promise<TavilyResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Tavily API key not configured.");

    const response = await fetch(TAVILY_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        include_answer: false,
        max_results: maxResults,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Tavily API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      results?: { title?: string; url?: string; content?: string; score?: number; published_date?: string }[];
    };

    return (json.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      score: r.score ?? 0,
      publishedDate: r.published_date,
    }));
  }

  /**
   * Run multiple research queries in parallel and return deduplicated results.
   */
  async researchMultiple(queries: string[], maxResultsPerQuery: number = 5): Promise<TavilyResult[]> {
    const batches = await Promise.all(
      queries.map((q) =>
        this.research(q, maxResultsPerQuery).catch((err) => {
          console.error(`Tavily research failed for query "${q}": ${err.message}`);
          return [] as TavilyResult[];
        })
      )
    );

    const seen = new Set<string>();
    const deduped: TavilyResult[] = [];
    for (const batch of batches) {
      for (const r of batch) {
        if (r.url && !seen.has(r.url)) {
          seen.add(r.url);
          deduped.push(r);
        }
      }
    }
    return deduped;
  }

  /**
   * Research competitive intelligence around a specific opportunity.
   */
  async researchOpportunity(opportunityTitle: string, agency: string): Promise<TavilyResult[]> {
    const query = `${agency} "${opportunityTitle}" federal contract award incumbent`;
    return this.research(query, 5);
  }

  /**
   * Extract full page content from one or more URLs using Tavily's Extract API.
   * Returns an array of { url, rawContent } objects.
   * Tavily extract is optimized for PDFs, procurement portals, and government pages.
   */
  async extractContent(urls: string[]): Promise<{ url: string; rawContent: string }[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Tavily API key not configured.");

    const response = await fetch(TAVILY_EXTRACT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, urls }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Tavily Extract error ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      results?: { url?: string; raw_content?: string }[];
    };

    return (json.results ?? [])
      .filter((r) => r.url && r.raw_content)
      .map((r) => ({ url: r.url!, rawContent: r.raw_content! }));
  }
}

export const tavilyProvider = new TavilyProvider();
