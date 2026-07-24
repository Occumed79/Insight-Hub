import type {
  DataSourceProvider,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";

/**
 * Direct Bonfire/Euna tenants are collected by publicPortalProviders. The
 * legacy eunaBonfire provider is Serper discovery rather than an official feed,
 * so it is retained as a compatibility key but performs no network work.
 */
class DisabledEunaDiscoveryProvider implements DataSourceProvider {
  readonly name = "eunaBonfire" as const;

  async isConfigured(): Promise<boolean> {
    return false;
  }

  async fetch(): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: false,
      healthy: true,
      errorMessage:
        "Search-discovered Euna results are disabled; direct Bonfire tenants run through Public Portals.",
      recordCount: 0,
    };
  }
}

export const disabledEunaDiscoveryProvider =
  new DisabledEunaDiscoveryProvider();
