import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";
import { composeAbortSignal } from "./abortSignals";

export interface TinyfishSearchResult {
  title: string;
  url: string;
  snippet: string;
  publisher?: string;
  publishedAt?: string;
  image?: string;
}

export class TinyfishProvider implements DataSourceProvider {
  readonly name = "tinyfish" as const;

  // This provider is exclusively for intelligence; never consume the news key.
  async isConfigured(): Promise<boolean> {
    return Boolean(await resolveCredential("tinyfishApiKey2", "TINYFISH_API_KEY_2"));
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    // Candidates enter the existing discovery, evidence and relevance pipeline.
    return { records: [], total: 0, errors: [] };
  }

  async search(query: string, options: {
    domains?: string[];
    publishedAfter?: string;
    signal?: AbortSignal;
  } = {}): Promise<TinyfishSearchResult[]> {
    const key = await resolveCredential("tinyfishApiKey2", "TINYFISH_API_KEY_2");
    if (!key) throw new Error("TinyFish intelligence key (TINYFISH_API_KEY_2) is not configured");
    const url = new URL("https://api.search.tinyfish.ai");
    url.searchParams.set("query", query);
    url.searchParams.set("domain_type", "web");
    url.searchParams.set("language", "en");
    url.searchParams.set("location", "US");
    url.searchParams.set("include_thumbnail", "true");
    if (options.domains?.length) url.searchParams.set("include_domains", options.domains.join(","));
    if (options.publishedAfter) url.searchParams.set("after_date", options.publishedAfter.slice(0, 10));
    const timeout = composeAbortSignal(12_000, options.signal);
    try {
      const response = await fetch(url, {
        headers: { "X-API-Key": key, Accept: "application/json" },
        signal: timeout.signal,
      });
      if (!response.ok) throw Object.assign(
        new Error(`TinyFish returned HTTP ${response.status}`),
        { statusCode: response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 503 : 502 },
      );
      const data = await response.json() as { results?: Record<string, unknown>[] };
      if (!Array.isArray(data.results)) throw new Error("TinyFish returned an invalid search response");
      return data.results.flatMap(row => {
        if (typeof row.url !== "string" || typeof row.title !== "string") return [];
        try {
          const target = new URL(row.url);
          if (!["http:", "https:"].includes(target.protocol)) return [];
          return [{
            title: row.title,
            url: target.href,
            snippet: typeof row.snippet === "string" ? row.snippet : "",
            publisher: typeof row.publisher === "string" ? row.publisher : typeof row.site_name === "string" ? row.site_name : target.hostname,
            publishedAt: typeof row.date === "string" ? row.date : undefined,
            image: typeof row.thumbnail_url === "string" && /^https?:\/\//.test(row.thumbnail_url) ? row.thumbnail_url : undefined,
          }];
        } catch { return []; }
      });
    } finally { timeout.cleanup(); }
  }
}
export const tinyfishProvider = new TinyfishProvider();
