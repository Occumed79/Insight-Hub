/**
 * Langsearch Provider
 *
 * Role: AI-native search API optimized for LLM workflows. Returns clean,
 * structured results well-suited for procurement opportunity discovery.
 *
 * API docs: https://langsearch.com/docs
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const LANGSEARCH_BASE = "https://api.langsearch.com/v1";

export class LangsearchProvider implements DataSourceProvider {
  readonly name = "langsearch" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("langsearchApiKey", "LANGSEARCH_API_KEY");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return { records: [], total: 0, errors: ["Langsearch API key not configured"] };

    const queries = this.buildQueries(options.keywords);
    const records = [];
    const errors: string[] = [];

    for (const query of queries.slice(0, 4)) {
      try {
        const res = await fetch(`${LANGSEARCH_BASE}/web-search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, count: 10, freshness: "Month" }),
        });

        if (!res.ok) {
          errors.push(`Langsearch error ${res.status}: ${await res.text().catch(() => "")}`);
          continue;
        }

        const data = await res.json() as {
          webPages?: { value?: Array<{ name: string; url: string; snippet: string }> };
        };

        for (const page of data.webPages?.value ?? []) {
          records.push({
            id: `langsearch-${Buffer.from(page.url).toString("base64").slice(0, 16)}`,
            title: page.name,
            description: page.snippet,
            url: page.url,
            source: "langsearch" as const,
            providerName: "Langsearch",
            status: "active" as const,
            relevanceScore: 50,
            rawData: { query, page },
          });
        }
      } catch (err: any) {
        errors.push(err.message ?? String(err));
      }
    }

    return { records: records as any, total: records.length, errors };
  }

  private buildQueries(keywords?: string): string[] {
    const year = new Date().getFullYear();
    return keywords
      ? [`${keywords} RFP solicitation ${year}`, `${keywords} government bid procurement ${year}`]
      : [
          `occupational health RFP solicitation government ${year}`,
          `drug testing employee health services contract bid ${year}`,
          `DOT physicals workplace safety government procurement ${year}`,
          `employee wellness occupational medicine RFP ${year}`,
        ];
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }
}

export const langsearchProvider = new LangsearchProvider();
