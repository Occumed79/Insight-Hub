/**
 * BidNet Direct Provider (State & Local Government Bids)
 *
 * Status: STUB — Architecture in place, but cannot be fully activated yet.
 *
 * To activate:
 * 1. Obtain a BidNet Direct API key (may require a specific subscription tier).
 * 2. Confirm the exact REST API base URL from BidNet support.
 * 3. Confirm authentication method (API key header, query param, OAuth).
 * 4. Confirm the bid/opportunity search endpoint structure and response shape.
 * 5. Set BIDNET_API_KEY and BIDNET_BASE_URL in your environment or Settings.
 *
 * Contact: https://www.bidnetdirect.com/contact
 *
 * NOTE: BidNet's programmatic API is not publicly documented.
 * This stub will not make any requests until the API structure is confirmed.
 */

import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

export class BidNetProvider implements DataSourceProvider {
  readonly name = "bidnet" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("bidnetApiKey", "BIDNET_API_KEY");
  }

  private async getBaseUrl(): Promise<string | null> {
    return resolveCredential("bidnetBaseUrl", "BIDNET_BASE_URL");
  }

  /**
   * BidNet is a configuration scaffold only — always returns false until the
   * endpoint contract is confirmed and the real HTTP call is implemented.
   * Having an API key or base URL stored does NOT make this provider operational.
   */
  async isConfigured(): Promise<boolean> {
    return false;
  }

  /**
   * BidNet fetch — optional future capability.
   *
   * Silently skips (returns empty records, no errors) when not configured so it
   * never pollutes fetch results or logs with errors during normal operation.
   * Once BIDNET_API_KEY and BIDNET_BASE_URL are set, this will activate.
   *
   * TODO: Replace the stub throw below with the real HTTP call once the API
   * endpoint structure is confirmed with BidNet Direct support.
   * Expected general pattern:
   *   GET {BASE_URL}/bids/search?key={key}&keywords={...}&postedAfter={...}
   *
   * normalize(bidRecord): NormalizedOpportunity should map:
   *   bidRecord.bidTitle -> title
   *   bidRecord.agency -> agency
   *   bidRecord.bidNumber -> solicitationNumber + externalId
   *   bidRecord.openDate -> postedDate
   *   bidRecord.closeDate -> responseDeadline
   *   bidRecord.detailUrl -> sourceUrl
   *   source: "bidnet"
   */
  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    const configured = await this.isConfigured();

    // Graceful no-op: if not configured, silently return empty.
    // This prevents stale API-key errors from flooding the fetch pipeline.
    if (!configured) {
      return { records: [], total: 0, errors: [] };
    }

    // TODO: Replace with real BidNet API call once endpoint structure is confirmed.
    // Returning empty for now even when configured — avoids throwing until implemented.
    return {
      records: [],
      total: 0,
      errors: ["BidNet API key is set but the endpoint integration is pending implementation."],
    };
  }

  async getStatus(): Promise<ProviderStatus> {
    // Always reports as not configured — stub only, never operational.
    // Credentials in DB or env are accepted for future use but do not activate the provider.
    return {
      name: this.name,
      configured: false,
      healthy: false,
      errorMessage: "BidNet integration is a configuration scaffold. The endpoint, authentication contract, and response mapping are not yet implemented.",
    };
  }
}

export const bidnetProvider = new BidNetProvider();
