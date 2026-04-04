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

  async isConfigured(): Promise<boolean> {
    const [key, url] = await Promise.all([this.getApiKey(), this.getBaseUrl()]);
    return !!(key && url);
  }

  /**
   * Stub: BidNet fetch is not yet implemented.
   * Once API endpoint structure is confirmed, implement the real HTTP call and
   * map the response to NormalizedOpportunity[] using a normalize() method.
   */
  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    const configured = await this.isConfigured();

    if (!configured) {
      const key = await this.getApiKey();
      const url = await this.getBaseUrl();
      const missing = [];
      if (!key) missing.push("API key");
      if (!url) missing.push("API base URL");
      throw new Error(`BidNet is not configured. Missing: ${missing.join(", ")}.`);
    }

    // TODO: Replace with real BidNet API call once endpoint structure is confirmed.
    // Expected general pattern:
    //   GET {BASE_URL}/bids/search?key={key}&keywords={...}&postedAfter={...}
    //
    // normalize(bidRecord): NormalizedOpportunity should map:
    //   bidRecord.bidTitle -> title
    //   bidRecord.agency -> agency
    //   bidRecord.bidNumber -> solicitationNumber + externalId
    //   bidRecord.openDate -> postedDate
    //   bidRecord.closeDate -> responseDeadline
    //   bidRecord.detailUrl -> sourceUrl
    //   source: "bidnet"

    throw new Error(
      "BidNet integration stub: API endpoint structure not yet confirmed. " +
        "Please contact BidNet Direct support for programmatic API access details and update this provider."
    );
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    const key = await this.getApiKey();
    const url = await this.getBaseUrl();

    const missing = [];
    if (!key) missing.push("API key");
    if (!url) missing.push("API base URL");

    return {
      name: this.name,
      configured,
      healthy: false,
      errorMessage: configured
        ? "API endpoint structure pending confirmation. Contact BidNet Direct support."
        : missing.length > 0
        ? `Missing: ${missing.join(", ")}`
        : undefined,
    };
  }
}

export const bidnetProvider = new BidNetProvider();
