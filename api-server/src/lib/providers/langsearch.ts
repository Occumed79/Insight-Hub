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

type LangsearchWebPage = {
  id?: string;
  name?: string;
  url?: string;
  displayUrl?: string;
  snippet?: string;
  summary?: string;
  datePublished?: string | null;
  dateLastCrawled?: string | null;
};

type LangsearchResponse = {
  code?: number;
  msg?: string | null;
  data?: {
    webPages?: { value?: LangsearchWebPage[] };
  };
  webPages?: { value?: LangsearchWebPage[] };
};

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
    if (!apiKey) return { records: [], total: 0, errors: ["LangSearch API key not configured"] };

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
          body: JSON.stringify({
            query,
            count: 10,
            freshness: this.freshnessForDateRange(options.dateRange),
            summary: true,
          }),
        });

        if (!res.ok) {
          errors.push(`LangSearch error ${res.status}: ${await res.text().catch(() => "")}`);
          continue;
        }

        const data = await res.json() as LangsearchResponse;
        if (data.code && data.code !== 200) {
          errors.push(`LangSearch API error ${data.code}: ${data.msg ?? "unknown error"}`);
          continue;
        }

        const pages = data.data?.webPages?.value ?? data.webPages?.value ?? [];
        if (pages.length === 0) {
          errors.push(`LangSearch returned 0 web results for query: ${query}`);
          continue;
        }

        for (const page of pages) {
          const url = page.url ?? page.displayUrl;
          if (!url) continue;

          records.push({
            id: `langsearch-${Buffer.from(url).toString("base64").slice(0, 16)}`,
            title: page.name ?? url,
            description: page.summary || page.snippet || "",
            url,
            source: "langsearch" as const,
            providerName: "langsearch",
            status: "active" as const,
            relevanceScore: 50,
            rawData: { query, page },
          });
        }
      } catch (err: any) {
        errors.push(`LangSearch: ${err.message ?? String(err)}`);
      }
    }

    return { records: records as any, total: records.length, errors };
  }

  private freshnessForDateRange(dateRange?: number): "oneDay" | "oneWeek" | "oneMonth" | "oneYear" | "noLimit" {
    if (!dateRange || dateRange <= 0) return "oneMonth";
    if (dateRange <= 1) return "oneDay";
    if (dateRange <= 7) return "oneWeek";
    if (dateRange <= 30) return "oneMonth";
    if (dateRange <= 365) return "oneYear";
    return "noLimit";
  }

  private buildQueries(keywords?: string): string[] {
    const year = new Date().getFullYear();
    return keywords
      ? [
          `${keywords} RFP solicitation ${year}`,
          `${keywords} government bid procurement ${year}`,
          `${keywords} request for proposal occupational health drug testing medical screening ${year}`,
        ]
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
