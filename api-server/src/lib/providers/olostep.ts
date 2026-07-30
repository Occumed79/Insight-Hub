/**
 * Olostep Provider
 *
 * Uses Olostep's current synchronous scrape endpoint to turn a page into
 * markdown or text for downstream opportunity analysis.
 */

import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { resolveCredential } from "../config/providerConfig";
import { composeAbortSignal } from "./abortSignals";

const OLOSTEP_SCRAPE_ENDPOINT = "https://api.olostep.com/v1/scrapes";
const OLOSTEP_REQUEST_TIMEOUT_MS = 30_000;

export interface OlostepScrapeResult {
  url: string;
  html_content?: string;
  markdown_content?: string;
  text_content?: string;
  status_code?: number;
}

interface OlostepCreateResponse {
  url_to_scrape?: string;
  result?: {
    html_content?: string;
    markdown_content?: string;
    text_content?: string;
    page_metadata?: {
      status_code?: number;
      title?: string;
    };
  };
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

  async scrape(
    url: string,
    options: {
      formats?: Array<"markdown" | "html" | "text">;
      waitFor?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<OlostepScrapeResult | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;

    const formats = options.formats?.length
      ? options.formats
      : (["markdown"] as const);
    const requestSignal = composeAbortSignal(
      OLOSTEP_REQUEST_TIMEOUT_MS,
      options.signal,
    );

    let response: Response;
    try {
      response = await fetch(OLOSTEP_SCRAPE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          url_to_scrape: url,
          formats,
          ...(options.waitFor
            ? { wait_before_scraping: options.waitFor }
            : {}),
        }),
        signal: requestSignal.signal,
      });
    } finally {
      requestSignal.cleanup();
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Olostep error ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    const payload = (await response.json()) as OlostepCreateResponse;
    const result = payload.result;
    if (!result) return null;

    return {
      url: payload.url_to_scrape ?? url,
      html_content: result.html_content,
      markdown_content: result.markdown_content,
      text_content: result.text_content,
      status_code: result.page_metadata?.status_code,
    };
  }

  async scrapeMany(urls: string[]): Promise<OlostepScrapeResult[]> {
    const concurrency = 5;
    const results: OlostepScrapeResult[] = [];

    for (let index = 0; index < urls.length; index += concurrency) {
      const batch = urls.slice(index, index + concurrency);
      const settled = await Promise.allSettled(
        batch.map((url) => this.scrape(url)),
      );
      for (const item of settled) {
        if (
          item.status === "fulfilled" &&
          item.value &&
          (item.value.markdown_content || item.value.text_content)
        ) {
          results.push(item.value);
        }
      }
    }

    return results;
  }

  async getText(url: string, signal?: AbortSignal): Promise<string | null> {
    const result = await this.scrape(url, {
      formats: ["markdown", "text"],
      signal,
    });
    return result?.markdown_content ?? result?.text_content ?? null;
  }
}

export const olostepProvider = new OlostepProvider();
