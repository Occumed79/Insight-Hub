/**
 * Olostep Provider
 *
 * Role: Residential-proxy web scraping. Routes requests through real residential
 * IP addresses to bypass bot detection and Cloudflare protection on procurement
 * portals and vendor sites. Returns clean page content for AI analysis.
 *
 * API docs: https://www.olostep.com/docs
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

const OLOSTEP_BASE = "https://agent.olostep.com/olostep-p2p-network";

export interface OlostepScrapeResult {
  url: string;
  html_content?: string;
  markdown_content?: string;
  text_content?: string;
  status_code?: number;
}

export class OlostepProvider implements DataSourceProvider {
  readonly name = "olostep" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("olostepApiKey", "OLOSTEP_API_KEY");
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
   * Scrape a URL through Olostep's residential proxy network.
   * Returns markdown content for AI analysis.
   */
  async scrape(
    url: string,
    options: {
      formats?: ("markdown" | "html" | "text")[];
      waitFor?: number;
    } = {}
  ): Promise<OlostepScrapeResult | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const { formats = ["markdown"], waitFor } = options;

    const params = new URLSearchParams({
      token: apiKey,
      url,
      formats: formats.join(","),
      ...(waitFor ? { wait_before_scraping: String(waitFor) } : {}),
    });

    const response = await fetch(`${OLOSTEP_BASE}?${params.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Olostep error ${response.status}: ${text.slice(0, 200)}`);
    }

    return response.json() as Promise<OlostepScrapeResult>;
  }

  /**
   * Scrape multiple URLs in parallel (up to 5 concurrent).
   * Returns only successful results with content.
   */
  async scrapeMany(urls: string[]): Promise<OlostepScrapeResult[]> {
    const CONCURRENCY = 5;
    const results: OlostepScrapeResult[] = [];

    for (let i = 0; i < urls.length; i += CONCURRENCY) {
      const batch = urls.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(batch.map((u) => this.scrape(u)));
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value?.markdown_content) {
          results.push(r.value);
        }
      }
    }

    return results;
  }

  /**
   * Get the text content from a URL, suitable for AI processing.
   */
  async getText(url: string): Promise<string | null> {
    const result = await this.scrape(url, { formats: ["markdown"] });
    return result?.markdown_content ?? result?.text_content ?? null;
  }
}

export const olostepProvider = new OlostepProvider();
