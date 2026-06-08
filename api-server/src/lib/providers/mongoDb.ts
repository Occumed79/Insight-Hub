import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

export interface MongoArchiveResult {
  ok?: boolean;
  inserted?: number;
  updated?: number;
  matched?: number;
  error?: string;
}

/**
 * Generic MongoDB API bridge.
 *
 * This intentionally treats MONGO_DB_API as an HTTPS endpoint controlled by the
 * deployment, not as a raw database connection string. That keeps secrets out of
 * the app and gives Render/Cloudflare/Mongo Data API style bridges one stable
 * contract:
 *
 *   POST {MONGO_DB_API}/opportunities/bulk
 *   { records: NormalizedOpportunity[] }
 */
export class MongoDbProvider implements DataSourceProvider {
  readonly name = "mongoDb" as const;

  private async getEndpoint(): Promise<string | null> {
    const value = await resolveCredential("mongoDbApi", "MONGO_DB_API");
    if (!value) return null;
    return value.replace(/\/$/, "");
  }

  async isConfigured(): Promise<boolean> {
    const endpoint = await this.getEndpoint();
    return !!endpoint && /^https:\/\//i.test(endpoint);
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    // MongoDB is a write-through archival/search backend in this app, not an
    // upstream opportunity source.
    return { records: [], total: 0, errors: [] };
  }

  async archiveOpportunities(records: NormalizedOpportunity[]): Promise<MongoArchiveResult | null> {
    if (records.length === 0) return { ok: true, inserted: 0, updated: 0, matched: 0 };

    const endpoint = await this.getEndpoint();
    if (!endpoint || !/^https:\/\//i.test(endpoint)) return null;

    try {
      const response = await fetch(`${endpoint}/opportunities/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return { ok: false, error: `MongoDB archive HTTP ${response.status}: ${text.slice(0, 200)}` };
      }

      const json = (await response.json().catch(() => ({}))) as MongoArchiveResult;
      return { ok: true, ...json };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    const endpoint = await this.getEndpoint();
    if (!endpoint) return { name: this.name, configured: false, healthy: false };
    if (!/^https:\/\//i.test(endpoint)) {
      return { name: this.name, configured: true, healthy: false, errorMessage: "MONGO_DB_API must be an HTTPS API endpoint, not a raw database URI." };
    }

    try {
      const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(8000) });
      return { name: this.name, configured: true, healthy: response.ok };
    } catch (error) {
      return {
        name: this.name,
        configured: true,
        healthy: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const mongoDbProvider = new MongoDbProvider();