import type {
  DataSourceProvider,
  FetchOptions,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { auditedPublicPortalProvider } from "./auditedPublicPortalProvider";
import { adjudicatePublicPortalResult } from "./publicPortalAiAdjudication";
import { loadPublicPortalHealth } from "./publicPortalProviders/portalHealthStore";

const EXPECTED_DIRECTORY_ONLY_FAILURES = [
  /robots disallow/i,
  /crawler redirect left allowed hosts/i,
  /crawler redirect limit exceeded/i,
];

function isExpectedDirectoryOnlyFailure(error: string): boolean {
  return EXPECTED_DIRECTORY_ONLY_FAILURES.some((pattern) => pattern.test(error));
}

/**
 * Registry-facing wrapper. Historical health rows remain persisted for audit,
 * but only source IDs that are still enabled and verified can affect current
 * provider health or record counts.
 *
 * The audited collector performs deterministic source-level filtering first.
 * This wrapper then applies Cloudflare semantic priority and Cerebras-led AI
 * adjudication so direct public portals use the same intelligence stack as web
 * discovery instead of bypassing it.
 */
class ProductionPublicPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  async isConfigured(): Promise<boolean> {
    return auditedPublicPortalProvider.isConfigured();
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const collected = await auditedPublicPortalProvider.fetch(options);
    const adjudicated = await adjudicatePublicPortalResult(
      collected,
      options.keywords,
    );

    // Robots exclusions and obsolete directory-page redirects are source access
    // classifications, not failures of the entire Public Portals provider. They
    // remain persisted in portal health for repair/rotation but no longer turn a
    // completed multi-source run into a misleading top-level provider error.
    return {
      ...adjudicated,
      errors: adjudicated.errors.filter(
        (error) => !isExpectedDirectoryOnlyFailure(error),
      ),
    };
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
        (status.lastOutcome === "failed" ||
          status.lastOutcome === "validation_failed") &&
        !isExpectedDirectoryOnlyFailure(status.lastFailureReason ?? ""),
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
