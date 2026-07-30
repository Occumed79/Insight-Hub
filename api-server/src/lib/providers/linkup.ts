import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { resolveCredential } from "../config/providerConfig";
import { composeAbortSignal } from "./abortSignals";

const LINKUP_SEARCH_URL = "https://api.linkup.so/v1/search";
const REQUEST_TIMEOUT_MS = 25_000;

export interface LinkupSearchResult {
  name: string;
  url: string;
  content: string;
}

export class LinkupProvider implements DataSourceProvider {
  readonly name = "linkup" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("linkupApiKey", "LINKUP_API_KEY");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async search(
    query: string,
    signal?: AbortSignal,
  ): Promise<LinkupSearchResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Linkup API key not configured.");
    const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, signal);
    try {
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 9);
      const response = await fetch(LINKUP_SEARCH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: query,
          depth: "fast",
          outputType: "searchResults",
          maxResults: 15,
          fromDate: fromDate.toISOString().slice(0, 10),
          excludeDomains: [
            "linkedin.com",
            "facebook.com",
            "instagram.com",
            "x.com",
          ],
        }),
        signal: requestSignal.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `Linkup API error ${response.status}: ${body.slice(0, 200)}`,
        );
      }
      const json = JSON.parse(body) as {
        results?: Array<{ name?: string; url?: string; content?: string }>;
      };
      return (json.results ?? []).flatMap((result) =>
        result.url
          ? [
              {
                name: result.name ?? result.url,
                url: result.url,
                content: result.content ?? "",
              },
            ]
          : [],
      );
    } finally {
      requestSignal.cleanup();
    }
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const query =
      options.keywords?.trim() ||
      `active occupational health RFP solicitation ${new Date().getFullYear()}`;
    const results = await this.search(query, options.signal);
    const records = results.map((result) => ({
      id: `linkup-${Buffer.from(result.url).toString("base64").slice(0, 16)}`,
      title: result.name,
      description: result.content,
      url: result.url,
      source: this.name,
      providerName: "Linkup",
      status: "active" as const,
      relevanceScore: 50,
      rawData: { query, result },
    }));
    return { records: records as any, total: records.length, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }
}

export const linkupProvider = new LinkupProvider();
