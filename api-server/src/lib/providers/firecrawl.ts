/**
 * FireCrawl Provider
 *
 * Role: Deep web scraping — given a URL found by Serper/Tavily, fetches the full
 * page content as clean markdown so AI providers have rich text to analyze instead
 * of a 2-sentence snippet.
 *
 * API docs: https://docs.firecrawl.dev/api-reference/endpoint/scrape
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

export interface FirecrawlScrapeResult {
  url: string;
  title: string;
  description: string;
  markdown: string;
}

export class FirecrawlProvider implements DataSourceProvider {
  readonly name = "firecrawl" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("firecrawlApiKey", "FIRECRAWL_API_KEY");
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
   * Scrape a single URL and return clean markdown content.
   * Returns null if the provider is not configured or the scrape fails.
   */
  async scrape(url: string): Promise<FirecrawlScrapeResult | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const response = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 20000,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`FireCrawl scrape error ${response.status}: ${body.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      success: boolean;
      data?: {
        markdown?: string;
        metadata?: { title?: string; description?: string; sourceURL?: string };
      };
    };

    if (!json.success || !json.data?.markdown) return null;

    return {
      url: json.data.metadata?.sourceURL ?? url,
      title: json.data.metadata?.title ?? "",
      description: json.data.metadata?.description ?? "",
      markdown: json.data.markdown,
    };
  }

  /**
   * Scrape multiple URLs in parallel (up to 5 concurrent).
   * Silently skips failed URLs.
   */
  async scrapeMany(urls: string[]): Promise<FirecrawlScrapeResult[]> {
    const CONCURRENCY = 5;
    const results: FirecrawlScrapeResult[] = [];

    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(batch.map((u) => this.scrape(u)));
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value) results.push(r.value);
      }
    }

    return results;
  }

  /**
   * Search the web via FireCrawl's built-in search endpoint.
   */
  async search(query: string, limit: number = 10): Promise<FirecrawlScrapeResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return [];

    const response = await fetch(`${FIRECRAWL_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
    });

    if (!response.ok) return [];

    const json = (await response.json()) as {
      success: boolean;
      data?: { url?: string; title?: string; description?: string; markdown?: string }[];
    };

    if (!json.success || !json.data) return [];

    return json.data
      .filter((r) => r.markdown)
      .map((r) => ({
        url: r.url ?? "",
        title: r.title ?? "",
        description: r.description ?? "",
        markdown: r.markdown ?? "",
      }));
  }
}

export const firecrawlProvider = new FirecrawlProvider();
