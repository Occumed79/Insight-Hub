/** Firecrawl search/scrape utility with three independent account fallbacks. */
import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { FreeTierCredentialPool } from "./freeTierCredentialPool";
import { composeAbortSignal } from "./abortSignals";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";
const credentials = new FreeTierCredentialPool(
  "firecrawl-multi-account",
  [
    { dbKey: "firecrawlApiKey", envKey: "FIRECRAWL_API_KEY" },
    { envKey: "FIRECRAWL_API_KEY_2" },
    { envKey: "FIRECRAWL_API_KEY_3" },
  ],
  { rotateOnSuccess: false },
);

export interface FirecrawlScrapeResult {
  url: string;
  title: string;
  description: string;
  markdown: string;
}

export class FirecrawlProvider implements DataSourceProvider {
  readonly name = "firecrawl" as const;

  async isConfigured(): Promise<boolean> { return credentials.isConfigured(); }
  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> { return { records: [], total: 0, errors: [] }; }
  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return { name: this.name, configured, healthy: configured };
  }

  async scrape(url: string, signal?: AbortSignal): Promise<FirecrawlScrapeResult | null> {
    if (!(await credentials.isConfigured())) return null;
    return credentials.run(async (apiKey) => {
      const requestSignal = composeAbortSignal(25_000, signal);
      try {
        const response = await fetch(`${FIRECRAWL_BASE}/scrape`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 20_000 }),
          signal: requestSignal.signal,
        });
        const body = await response.text();
        if (!response.ok) throw new Error(`Firecrawl scrape error ${response.status}: ${body.slice(0, 200)}`);
        const json = JSON.parse(body) as { success?: boolean; data?: { markdown?: string; metadata?: { title?: string; description?: string; sourceURL?: string; url?: string } } };
        const markdown = json.data?.markdown?.trim();
        if (!json.success || !markdown) return null;
        return {
          url: json.data?.metadata?.sourceURL ?? json.data?.metadata?.url ?? url,
          title: json.data?.metadata?.title ?? "",
          description: json.data?.metadata?.description ?? "",
          markdown,
        };
      } finally { requestSignal.cleanup(); }
    });
  }

  async scrapeMany(urls: string[]): Promise<FirecrawlScrapeResult[]> {
    const results: FirecrawlScrapeResult[] = [];
    for (let index = 0; index < urls.length; index += 5) {
      const settled = await Promise.allSettled(urls.slice(index, index + 5).map((url) => this.scrape(url)));
      for (const result of settled) if (result.status === "fulfilled" && result.value) results.push(result.value);
    }
    return results;
  }

  async search(query: string, limit = 10, signal?: AbortSignal): Promise<FirecrawlScrapeResult[]> {
    if (!(await credentials.isConfigured())) return [];
    return credentials.run(async (apiKey) => {
      const requestSignal = composeAbortSignal(30_000, signal);
      try {
        const response = await fetch(`${FIRECRAWL_BASE}/search`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, limit: Math.max(1, Math.min(25, limit)), sources: ["web"], timeout: 25_000 }),
          signal: requestSignal.signal,
        });
        const body = await response.text();
        if (!response.ok) throw new Error(`Firecrawl search error ${response.status}: ${body.slice(0, 200)}`);
        const json = JSON.parse(body) as { success?: boolean; data?: { web?: Array<{ url?: string; title?: string; description?: string; markdown?: string; metadata?: { sourceURL?: string; title?: string; description?: string } }> } };
        if (!json.success) return [];
        return (json.data?.web ?? []).flatMap((result) => {
          const foundUrl = result.url ?? result.metadata?.sourceURL;
          return foundUrl ? [{
            url: foundUrl,
            title: result.title ?? result.metadata?.title ?? foundUrl,
            description: result.description ?? result.metadata?.description ?? "",
            markdown: result.markdown ?? result.description ?? "",
          }] : [];
        });
      } finally { requestSignal.cleanup(); }
    });
  }
}

export const firecrawlProvider = new FirecrawlProvider();
