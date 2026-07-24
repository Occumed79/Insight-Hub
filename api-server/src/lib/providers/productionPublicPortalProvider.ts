import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { auditedPublicPortalProvider } from "./auditedPublicPortalProvider";
import { loadPublicPortalHealth } from "./publicPortalProviders/portalHealthStore";

/**
 * Registry-facing wrapper. Historical health rows remain persisted for audit,
 * but only source IDs that are still enabled and verified can affect current
 * provider health or record counts.
 */
class ProductionPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    return auditedPublicPortalProvider.isConfigured();
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    return auditedPublicPortalProvider.fetch(options);
  }

  async getStatus(): Promise<ProviderStatus> {
    const activeIds = new Set(
      auditedPublicPortalProvider
        .getSources()
        .filter(
          (source) =>
            source.enabled && source.verificationStatus === "verified",
        )
        .map((source) => source.id),
    );
    const statuses = Array.from(
      (await loadPublicPortalHealth().catch(() => new Map())).values(),
    ).filter((status) => activeIds.has(status.sourceId));
    const failures = statuses.filter(
      (status) =>
        status.lastOutcome === "failed" ||
        status.lastOutcome === "validation_failed",
    );
    return {
      name: this.name,
      configured: await this.isConfigured(),
      healthy: failures.length === 0,
      errorMessage: failures.length
        ? `${failures.length} active portal source${failures.length === 1 ? " is" : "s are"} currently failing`
        : undefined,
      recordCount: statuses.reduce(
        (sum, status) => sum + status.matchedCount,
        0,
      ),
      lastAttempt: statuses.reduce<Date | undefined>(
        (latest, status) =>
          !latest || status.lastCheckedAt > latest
            ? status.lastCheckedAt
            : latest,
        undefined,
      ),
      lastSuccess: statuses.reduce<Date | undefined>(
        (latest, status) =>
          status.lastSuccessAt &&
          (!latest || status.lastSuccessAt > latest)
            ? status.lastSuccessAt
            : latest,
        undefined,
      ),
    };
  }
}

export const productionPublicPortalProvider =
  new ProductionPublicPortalProvider();
