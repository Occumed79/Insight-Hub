/**
 * Serper Provider (retired)
 *
 * Serper's free allowance is a finite signup balance rather than renewable
 * operating capacity. Keep this compatibility shell so historical provider
 * names and imports remain valid, but never configure or call Serper at
 * runtime.
 */

import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";

export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  source?: string;
}

const DEFAULT_SAFE_QUERY = "occupational health services RFP solicitation";
const MAX_SAFE_QUERY_LENGTH = 220;

/** Retained for compatibility with existing tests and callers. */
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
      errorMessage: "Serper retired: finite signup quota is not used for autonomous intelligence.",
    };
  }

  async search(
    _query: string,
    _num = 10,
    _options: {
      type?: "search" | "news";
      tbs?: string;
      page?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<SerperSearchResult[]> {
    return [];
  }

  async searchMultiple(
    _queries: string[],
    _numPerQuery = 10,
    _options: { signal?: AbortSignal } = {},
  ): Promise<SerperSearchResult[]> {
    return [];
  }

  async enrichOpportunity(
    _opportunityTitle: string,
    _agency: string,
  ): Promise<SerperSearchResult[]> {
    return [];
  }
}

export const serperProvider = new SerperProvider();
