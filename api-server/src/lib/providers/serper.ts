/**
 * Serper Provider (Google Search API)
 *
 * Role: active web discovery for state, local, and private-sector procurement
 * opportunities that are not covered by the structured federal APIs.
 */

import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { resolveCredential } from "../config/providerConfig";
import { composeAbortSignal } from "./abortSignals";

const SERPER_BASE = "https://google.serper.dev";
const SERPER_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_SAFE_QUERY = "occupational health services RFP solicitation";
const MAX_SAFE_QUERY_LENGTH = 220;

export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  source?: string;
}

/**
 * Serper free accounts reject several Google-style query patterns, including
 * nested boolean groups and some advanced operators. Search quality is better
 * when we send a compact plain-language query instead of spending a request on
 * a pattern the account cannot execute.
 */
export function toSerperFreeTierQuery(query: string): string {
  const withoutNegativeTerms = query.replace(
    /-(?:"[^"]+"|'[^']+'|\S+)/g,
    " ",
  );
  const withoutAdvancedOperators = withoutNegativeTerms
    .replace(/\b(?:site|inurl|intitle|filetype):\S+/gi, " ")
    .replace(/\b(?:OR|AND)\b/gi, " ")
    .replace(/[()"']/g, " ")
    .replace(/[^a-zA-Z0-9&/.,\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const safe = withoutAdvancedOperators || DEFAULT_SAFE_QUERY;
  if (safe.length <= MAX_SAFE_QUERY_LENGTH) return safe;

  const shortened = safe.slice(0, MAX_SAFE_QUERY_LENGTH + 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return shortened.slice(0, lastSpace > 40 ? lastSpace : MAX_SAFE_QUERY_LENGTH);
}

export class SerperProvider implements DataSourceProvider {
  readonly name = "serper" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("serperApiKey", "SERPER_API_KEY");
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

  async search(
    query: string,
    num: number = 10,
    options: {
      type?: "search" | "news";
      tbs?: string;
      page?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<SerperSearchResult[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Serper API key not configured.");

    const endpoint = options.type === "news" ? "/news" : "/search";
    const body: Record<string, unknown> = {
      q: toSerperFreeTierQuery(query),
      num,
    };
    if (options.tbs) body.tbs = options.tbs;
    if (options.page && options.page > 1) body.page = options.page;

    const requestSignal = composeAbortSignal(
      SERPER_REQUEST_TIMEOUT_MS,
      options.signal,
    );
    let response: Response;
    try {
      response = await fetch(`${SERPER_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: requestSignal.signal,
      });
    } finally {
      requestSignal.cleanup();
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Serper API error ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    const json = (await response.json()) as {
      organic?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
        date?: string;
        source?: string;
      }>;
      news?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
        date?: string;
        source?: string;
      }>;
    };

    const items = json.organic ?? json.news ?? [];
    return items.map((result) => ({
      title: result.title ?? "",
      link: result.link ?? "",
      snippet: result.snippet ?? "",
      date: result.date,
      source: result.source,
    }));
  }

  async searchMultiple(
    queries: string[],
    numPerQuery: number = 10,
    options: { signal?: AbortSignal } = {},
  ): Promise<SerperSearchResult[]> {
    const batches = await Promise.all(
      queries.map((query) =>
        this.search(query, numPerQuery, { signal: options.signal }).catch(
          (error) => {
            console.error(
              `Serper search failed for query ${JSON.stringify(query)}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return [] as SerperSearchResult[];
          },
        ),
      ),
    );

    const seen = new Set<string>();
    const deduped: SerperSearchResult[] = [];
    for (const batch of batches) {
      for (const result of batch) {
        if (result.link && !seen.has(result.link)) {
          seen.add(result.link);
          deduped.push(result);
        }
      }
    }
    return deduped;
  }

  async enrichOpportunity(
    opportunityTitle: string,
    agency: string,
  ): Promise<SerperSearchResult[]> {
    return this.search(
      `${agency} ${opportunityTitle} government contract solicitation`,
      5,
    );
  }
}

export const serperProvider = new SerperProvider();
