/**
 * OloStep Provider (retired)
 *
 * OloStep's free allowance is not treated as dependable renewable operating
 * capacity. Keep this compatibility shell so historical provider names and
 * imports remain valid, but never configure or call OloStep at runtime.
 */

import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";

export interface OlostepScrapeResult {
  url: string;
  html_content?: string;
  markdown_content?: string;
  text_content?: string;
  status_code?: number;
}

export class OlostepProvider implements DataSourceProvider {
  readonly name = "olostep" as const;

  async isConfigured(): Promise<boolean> {
    return false;
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: false,
      healthy: false,
      errorMessage: "OloStep retired: finite/trial quota is not used for autonomous intelligence.",
    };
  }

  async scrape(
    _url: string,
    _options: {
      formats?: Array<"markdown" | "html" | "text">;
      waitFor?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<OlostepScrapeResult | null> {
    return null;
  }

  async scrapeMany(_urls: string[]): Promise<OlostepScrapeResult[]> {
    return [];
  }

  async getText(
    _url: string,
    _signal?: AbortSignal,
  ): Promise<string | null> {
    return null;
  }
}

export const olostepProvider = new OlostepProvider();
