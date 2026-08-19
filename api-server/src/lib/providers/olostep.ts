/**
 * OloStep compatibility utility (retired).
 *
 * OloStep is intentionally absent from ProviderName, providerRegistry,
 * PROVIDER_DEFINITIONS and autonomous Opportunity Intelligence. This inert shell
 * remains only for older non-ingestion imports and never reads a key or performs
 * a network request.
 */

export interface OlostepScrapeResult {
  url: string;
  html_content?: string;
  markdown_content?: string;
  text_content?: string;
  status_code?: number;
}

export class OlostepProvider {
  readonly name = "olostep" as const;

  async isConfigured(): Promise<boolean> {
    return false;
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
