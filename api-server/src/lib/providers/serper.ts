/**
 * Serper compatibility utility (retired).
 *
 * Serper is intentionally absent from ProviderName, providerRegistry,
 * PROVIDER_DEFINITIONS and Opportunity Intelligence ingestion. This inert shell
 * exists only so older non-ingestion research modules can compile while they are
 * migrated. It never reads SERPER_API_KEY and never performs a network call.
 */

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position?: number;
  date?: string;
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
    _options: { num?: number; recency?: string; signal?: AbortSignal } = {},
  ): Promise<SerperResult[]> {
    return [];
  }
}

export const serperProvider = new SerperProvider();
