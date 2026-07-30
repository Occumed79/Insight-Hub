import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { resolveCredential } from "../config/providerConfig";
import { composeAbortSignal } from "./abortSignals";

const PARALLEL_SEARCH_URL = "https://api.parallel.ai/v1/search";
const REQUEST_TIMEOUT_MS = 25_000;

export interface ParallelSearchResult {
  url: string;
  title: string;
  publishDate?: string;
  excerpts: string[];
}

export class ParallelProvider implements DataSourceProvider {
  readonly name = "parallel" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("parallelApiKey", "PARALLEL_API_KEY");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  async search(
    query: string,
    signal?: AbortSignal,
  ): Promise<ParallelSearchResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Parallel API key not configured.");
    const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, signal);
    try {
      const response = await fetch(PARALLEL_SEARCH_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          objective:
            "Find currently open RFPs, RFQs, solicitations, and supplier opportunities relevant to Occu-Med occupational health services. Prefer original buyer or procurement pages and future deadlines.",
          search_queries: [query],
          mode: "basic",
          max_chars_total: 12_000,
        }),
        signal: requestSignal.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(
          `Parallel API error ${response.status}: ${body.slice(0, 200)}`,
        );
      }
      const json = JSON.parse(body) as {
        results?: Array<{
          url?: string;
          title?: string;
          publish_date?: string | null;
          excerpts?: string[];
        }>;
      };
      return (json.results ?? []).flatMap((result) =>
        result.url
          ? [
              {
                url: result.url,
                title: result.title ?? result.url,
                publishDate: result.publish_date ?? undefined,
                excerpts: Array.isArray(result.excerpts) ? result.excerpts : [],
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
      `occupational health RFP solicitation ${new Date().getFullYear()}`;
    const results = await this.search(query, options.signal);
    const records = results.map((result) => ({
      id: `parallel-${Buffer.from(result.url).toString("base64").slice(0, 16)}`,
      title: result.title,
      description: result.excerpts.join(" "),
      url: result.url,
      source: this.name,
      providerName: "Parallel",
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

export const parallelProvider = new ParallelProvider();
