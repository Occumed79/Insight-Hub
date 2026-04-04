/**
 * Tango Provider (Procurement Intelligence)
 *
 * Status: STUB — Architecture in place, but cannot be fully activated yet.
 *
 * To activate:
 * 1. Obtain a Tango API key from your Tango account representative.
 * 2. Confirm the exact REST API base URL and authentication method (Bearer token, query param, etc.).
 * 3. Provide the endpoint structure for opportunity/bid search.
 * 4. Set TANGO_API_KEY in your environment or Settings.
 *
 * NOTE: Tango's programmatic API details are not publicly documented.
 * This stub is intentionally conservative — it will not make any requests
 * until the exact endpoint structure is confirmed.
 */

import type { DataSourceProvider, FetchOptions, ProviderFetchResult, ProviderStatus } from "./types";
import { resolveCredential } from "../config/providerConfig";

export class TangoProvider implements DataSourceProvider {
  readonly name = "tango" as const;

  private async getApiKey(): Promise<string | null> {
    return resolveCredential("tangoApiKey", "TANGO_API_KEY");
  }

  async isConfigured(): Promise<boolean> {
    return !!(await this.getApiKey());
  }

  /**
   * Stub: Tango fetch is not yet implemented.
   * Once the API endpoint structure is confirmed, implement the real HTTP call here.
   */
  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    const configured = await this.isConfigured();
    if (!configured) {
      throw new Error("Tango API key not configured.");
    }

    // TODO: Replace with real Tango API call once endpoint structure is confirmed.
    // Expected shape:
    //   GET {TANGO_BASE_URL}/opportunities?apiKey={key}&keywords={...}&fromDate={...}
    // Return type should be mapped to NormalizedOpportunity[] using a normalize() method.

    throw new Error(
      "Tango integration stub: API endpoint structure not yet confirmed. " +
        "Please contact Tango support for programmatic API access details and update this provider."
    );
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: this.name,
      configured,
      healthy: false,
      errorMessage: configured
        ? "API endpoint structure pending confirmation. Contact Tango support."
        : undefined,
    };
  }
}

export const tangoProvider = new TangoProvider();
