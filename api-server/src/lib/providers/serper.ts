/**
 * Serper compatibility utility (retired).
 *
 * Serper is intentionally absent from ProviderName, providerRegistry,
 * PROVIDER_DEFINITIONS and Opportunity Intelligence ingestion. This inert shell
 * exists only so older non-ingestion research modules can compile while they are
 * migrated. It never reads SERPER_API_KEY and never performs a network call.
 */

export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
  date?: string;
  source?: string;
}

export type SerperResult = SerperSearchResult;

export interface LegacySerperSearchOptions {
  num?: number;
  recency?: string;
  type?: string;
  tbs?: string;
  signal?: AbortSignal;
}

export function toSerperFreeTierQuery(query: string): string {
  const tokens = query
    .replace(/site:\S+/gi, " ")
    .replace(/-\S+/g, " ")
    .replace(/[()\"]/g, " ")
    .replace(/\b(?:AND|OR|NOT)\b/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return Array.from(new Set(tokens)).join(" ").slice(0, 180);
}

export class SerperProvider {
  readonly name = "serper" as const;

  async isConfigured(): Promise<boolean> {
    return false;
  }

  async search(
    _query: string,
    _optionsOrNum: LegacySerperSearchOptions | number = {},
    _legacyOptions: LegacySerperSearchOptions = {},
  ): Promise<SerperSearchResult[]> {
    return [];
  }

  async searchMultiple(
    _queries: string[],
    _numPerQuery = 10,
    _options: LegacySerperSearchOptions = {},
  ): Promise<SerperSearchResult[]> {
    return [];
  }
}

export const serperProvider = new SerperProvider();
