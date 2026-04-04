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

const SERPER_BASE = "https://google.serper.dev/search";

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
   */
  async search(query: string, num: number = 10): Promise<SerperSearchResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Serper API key not configured.");

    const response = await fetch(SERPER_BASE, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Serper API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      organic?: { title?: string; link?: string; snippet?: string; date?: string; source?: string }[];
    };

    return (json.organic ?? []).map((r) => ({
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
