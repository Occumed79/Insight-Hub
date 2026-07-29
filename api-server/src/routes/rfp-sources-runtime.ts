import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const LOAD_TIMEOUT_MS = 8_000;
const DB_TIMEOUT_MS = 3_500;
const CACHE_TTL_MS = 5 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

type CachedPayload = {
  expiresAt: number;
  payload: JsonRecord;
};

let cachedPayload: CachedPayload | null = null;
let inFlight: Promise<JsonRecord> | null = null;

function withDeadline<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function buildRuntimeInventory(): Promise<JsonRecord> {
  const [
    relevanceModule,
    capabilityModule,
    publishedModule,
    inventoryModule,
    healthModule,
  ] = await withDeadline(
    Promise.all([
      import("../lib/providers/directRfpPortalRelevanceCatalog"),
      import("../lib/providers/portalCapabilities"),
      import("../lib/providers/publishedDirectRfpCatalogue"),
      import("../lib/providers/publicPortalRuntimeInventory"),
      import("../lib/providers/publicPortalProviders/portalHealthStore"),
    ]),
    LOAD_TIMEOUT_MS,
    "Runtime source modules",
  );

  const warnings: string[] = [];

  const healthBySourceId = await withDeadline(
    healthModule.loadPublicPortalHealth(),
    DB_TIMEOUT_MS,
    "Persisted source health",
  ).catch((error) => {
    warnings.push(error instanceof Error ? error.message : "Persisted source health was unavailable");
    return new Map<string, any>();
  });

  const crawlerModule = await withDeadline(
    import("../lib/crawler"),
    DB_TIMEOUT_MS,
    "Crawler registry",
  ).catch((error) => {
    warnings.push(error instanceof Error ? error.message : "Crawler registry was unavailable");
    return null;
  });

  const approvedCrawlerConfigs = crawlerModule
    ? await withDeadline(
        crawlerModule.listApprovedDiscoverySpiderConfigs(),
        DB_TIMEOUT_MS,
        "Approved crawler configs",
      ).catch((error) => {
        warnings.push(error instanceof Error ? error.message : "Approved crawler configs were unavailable");
        return [];
      })
    : [];

  if (crawlerModule) {
    for (const config of approvedCrawlerConfigs) crawlerModule.registerSpiderConfig(config);
  }

  const approvedCrawlerBySourceId = new Map(
    crawlerModule
      ? approvedCrawlerConfigs
          .filter(crawlerModule.isApprovedPublicPortalSpiderConfig)
          .map((config) => [config.sourceId, config] as const)
      : [],
  );

  const sources = relevanceModule.ENRICHED_DIRECT_RFP_PORTALS
    .filter((source) => publishedModule.PUBLISHED_DIRECT_RFP_PORTAL_IDS.has(source.id))
    .map(capabilityModule.withPortalConnectorCapability)
    .map((source) => {
      const approvedCrawler = approvedCrawlerBySourceId.get(source.id);
      const crawlerRunnable = Boolean(approvedCrawler);
      const runtimeRunnable = source.runtimeRunnable || crawlerRunnable;
      const registeredAdapter = source.registeredAdapter || crawlerRunnable;
      const registrationKind = source.registeredAdapter
        ? source.registrationKind
        : approvedCrawler?.kind === "json_endpoint"
          ? "approved_api"
          : approvedCrawler
            ? "vetted_extractor"
            : "adapter";
      const quarantine = runtimeRunnable
        ? healthModule.portalQuarantineDecision(healthBySourceId.get(source.id))
        : { quarantined: false as const };

      return {
        ...source,
        registeredAdapter,
        runtimeRunnable,
        registrationKind,
        connectorStatus: crawlerRunnable ? ("generic_extraction" as const) : source.connectorStatus,
        connectorLabel: crawlerRunnable
          ? approvedCrawler?.kind === "json_endpoint"
            ? "Approved official API"
            : "Vetted extractor"
          : source.connectorLabel,
        connectorDescription: crawlerRunnable
          ? approvedCrawler?.kind === "json_endpoint"
            ? "Collected through an explicitly approved official structured endpoint registered in the crawler registry."
            : "Collected through a deliberately vetted bounded extractor registered in the crawler registry."
          : source.connectorDescription,
        unfinished: false,
        disabled: false,
        quarantined: quarantine.quarantined,
        quarantineReason: quarantine.reason,
        quarantineReasonLabel: quarantine.reason
          ? healthModule.portalQuarantineReasonLabel(quarantine.reason)
          : undefined,
      };
    })
    .filter((source) => source.runtimeRunnable && source.registeredAdapter);

  const runtimeSourceIds = new Set(sources.map((source) => source.id));
  const healthSources = Array.from(healthBySourceId.values())
    .filter((status: any) => runtimeSourceIds.has(status.sourceId))
    .map((status: any) => {
      const quarantine = healthModule.portalQuarantineDecision(status);
      const currentlyFailing =
        !quarantine.quarantined &&
        Boolean(
          status.lastFailureAt &&
            (!status.lastSuccessAt || status.lastFailureAt > status.lastSuccessAt),
        );

      return {
        sourceId: status.sourceId,
        sourceName: status.sourceName,
        domain: status.domain,
        lastCheckedAt: status.lastCheckedAt,
        lastSuccessAt: status.lastSuccessAt,
        lastFailureAt: status.lastFailureAt,
        lastFailureReason: status.lastFailureReason,
        resultCount: status.resultCount,
        matchedCount: status.matchedCount,
        totalAttempts: status.totalAttempts,
        totalSuccesses: status.totalSuccesses,
        totalFailures: status.totalFailures,
        consecutiveFailures: status.consecutiveFailures,
        lastOutcome: quarantine.quarantined ? "quarantined" : status.lastOutcome,
        currentlyFailing,
        quarantined: quarantine.quarantined,
        quarantineReasonLabel: quarantine.reason
          ? healthModule.portalQuarantineReasonLabel(quarantine.reason)
          : undefined,
      };
    });

  const healthSummary = healthSources.reduce(
    (summary, status) => {
      summary.checked += 1;
      if (status.quarantined) summary.quarantined += 1;
      else if (status.currentlyFailing) summary.failing += 1;
      else if (status.lastOutcome === "success") summary.success += 1;
      else if (status.lastOutcome === "no_results") summary.noResults += 1;
      else if (status.lastOutcome === "validation_failed") summary.validationFailed += 1;
      return summary;
    },
    {
      checked: 0,
      success: 0,
      noResults: 0,
      failing: 0,
      quarantined: 0,
      validationFailed: 0,
    },
  );

  return {
    inventory: inventoryModule.buildPublicPortalRuntimeInventory(sources),
    health: {
      summary: healthSummary,
      sources: healthSources,
    },
    validation: {
      published: publishedModule.validatePublishedDirectRfpCatalogue(),
    },
    degraded: warnings.length > 0,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

router.get("/rfp-sources/runtime-inventory", async (_req, res) => {
  const now = Date.now();
  if (cachedPayload && cachedPayload.expiresAt > now) {
    return res.json({ ...cachedPayload.payload, cached: true });
  }

  try {
    if (!inFlight) inFlight = buildRuntimeInventory();
    const payload = await inFlight;
    cachedPayload = { payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return res.json({ ...payload, cached: false });
  } catch (error) {
    logger.error({ err: error }, "Lightweight runtime source inventory failed");
    return res.status(503).json({
      error: error instanceof Error ? error.message : "Runtime source inventory could not be loaded",
    });
  } finally {
    inFlight = null;
  }
});

export default router;
