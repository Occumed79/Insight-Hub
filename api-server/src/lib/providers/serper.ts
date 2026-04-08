/**
 * Serper Provider (Google Search API)
 *
 * Role: Active web discovery — searches Google for RFPs, solicitations, and
 * procurement opportunities not indexed in SAM.gov (state/local/private sector).
 *
 * API docs: https://serper.dev/docs
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const SERPER_BASE = "https://google.serper.dev";

export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  source?: string;
}

export class SerperProvider implements DataSourceProvider {
  readonly name = "serper" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("serperApiKey", "SERPER_API_KEY");
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
   * Execute a single Google search query via Serper.
   * @param type "search" (default) | "news" — news mode returns recently published articles
   * @param tbs Time-based search filter: "qdr:w" = past week, "qdr:m" = past month
   */
  async search(
    query: string,
    num: number = 10,
    options: { type?: "search" | "news"; tbs?: string } = {}
  ): Promise<SerperSearchResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Serper API key not configured.");

    const endpoint = options.type === "news" ? "/news" : "/search";

    const body: Record<string, unknown> = { q: query, num };
    if (options.tbs) body["tbs"] = options.tbs;

    const response = await fetch(`${SERPER_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Serper API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      organic?: { title?: string; link?: string; snippet?: string; date?: string; source?: string }[];
      news?: { title?: string; link?: string; snippet?: string; date?: string; source?: string }[];
    };

    const items = json.organic ?? json.news ?? [];

    return items.map((r) => ({
      title: r.title ?? "",
      link: r.link ?? "",
      snippet: r.snippet ?? "",
      date: r.date,
      source: r.source,
    }));
  }

  /**
   * Run multiple search queries in parallel and return deduplicated results.
   */
  async searchMultiple(queries: string[], numPerQuery: number = 10): Promise<SerperSearchResult[]> {
    const batches = await Promise.all(
      queries.map((q) =>
        this.search(q, numPerQuery).catch((err) => {
          console.error(`Serper search failed for query "${q}": ${err.message}`);
          return [] as SerperSearchResult[];
        })
      )
    );

    const seen = new Set<string>();
    const deduped: SerperSearchResult[] = [];
    for (const batch of batches) {
      for (const r of batch) {
        if (r.link && !seen.has(r.link)) {
          seen.add(r.link);
          deduped.push(r);
        }
      }
    }
    return deduped;
  }

  /**
   * Enrich a known opportunity with related web context.
   */
  async enrichOpportunity(opportunityTitle: string, agency: string): Promise<SerperSearchResult[]> {
    const query = `"${agency}" "${opportunityTitle}" government contract site:*.gov OR site:sam.gov`;
    return this.search(query, 5);
  }
}

export const serperProvider = new SerperProvider();
