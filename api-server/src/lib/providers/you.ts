/**
 * You.com Provider
 *
 * Role: AI-powered web search with structured results. You.com's Search API
 * returns high-quality, relevant web results with snippets, ideal for finding
 * active procurement opportunities across the open web.
 *
 * API docs: https://documentation.you.com/api-reference
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";
import { OCCUMED_PROFILE } from "./gemini";

const YOU_BASE = "https://api.ydc-index.io";

export class YouProvider implements DataSourceProvider {
  readonly name = "you" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("youApiKey", "YOU_API_KEY");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return { records: [], total: 0, errors: ["You.com API key not configured"] };

    const queries = this.buildQueries(options.keywords);
    const records = [];
    const errors: string[] = [];

    for (const query of queries.slice(0, 4)) {
      try {
        const url = new URL(`${YOU_BASE}/search`);
        url.searchParams.set("query", query);
        url.searchParams.set("num_web_results", "10");

        const res = await fetch(url.toString(), {
          headers: { "X-API-Key": apiKey },
        });

        if (!res.ok) {
          errors.push(`You.com error ${res.status} for query: ${query}`);
          continue;
        }

        const data = await res.json() as {
          hits?: Array<{ title: string; url: string; description: string; snippets?: string[] }>;
        };

        for (const hit of data.hits ?? []) {
          records.push({
            id: `you-${Buffer.from(hit.url).toString("base64").slice(0, 16)}`,
            title: hit.title,
            description: (hit.snippets ?? []).join(" ") || hit.description,
            url: hit.url,
            source: "you" as const,
            providerName: "You.com",
            status: "active" as const,
            relevanceScore: 50,
            rawData: { query, hit },
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
    const base = keywords
      ? [`${keywords} RFP solicitation ${year}`, `${keywords} government contract bid ${year}`]
      : [
          `occupational health services RFP solicitation ${year}`,
          `drug testing DOT physicals government contract ${year}`,
          `employee wellness occupational medicine RFP ${year}`,
          `audiometric pulmonary testing solicitation ${year}`,
        ];
    return base;
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }
}

export const youProvider = new YouProvider();
