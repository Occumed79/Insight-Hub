import { Router } from "express";
import {
  isApprovedPublicPortalSpiderConfig,
  listApprovedDiscoverySpiderConfigs,
  listCrawlFrontier,
  listDiscoveryCandidates,
  listSpiderConfigs,
  listSpiderKinds,
  registerSpiderConfig,
  type CrawlFrontierState,
  type StoredDiscoveryCandidate,
} from "../lib/crawler";
import {
  ENRICHED_DIRECT_RFP_PORTALS,
  validateDirectRfpPortalRelevanceCatalog,
} from "../lib/providers/directRfpPortalRelevanceCatalog";
import {
  buildPortalEvidenceScanPlan,
  scanPortalEvidence,
} from "../lib/providers/portalEvidenceScanner";
import { getPublicPortalSearchPlanDiagnostics } from "../lib/providers/publicPortalDiscovery";
import { buildProcurementPortalDirectory } from "../lib/providers/portalDirectory";
import { withPortalConnectorCapability } from "../lib/providers/portalCapabilities";
import { publicPortalProvidersProvider } from "../lib/providers/publicPortalProviders";
import {
  portalQuarantineDecision,
  portalQuarantineReasonLabel,
} from "../lib/providers/publicPortalProviders/portalHealthStore";
import { buildPublicPortalRuntimeInventory } from "../lib/providers/publicPortalRuntimeInventory";

const router = Router();

router.get("/rfp-sources", async (req, res) => {
  const includeTier3 = String(req.query.includeTier3 ?? "true") === "true";
  const fullCoverage = String(req.query.fullCoverage ?? "false") === "true";
  const executionBudget = Math.max(
    1,
    Number(req.query.executionBudget ?? 6) || 6,
  );
  const rotationKey =
    typeof req.query.rotationKey === "string"
      ? req.query.rotationKey
      : undefined;

  const approvedCrawlerConfigs = await listApprovedDiscoverySpiderConfigs().catch(
    () => [],
  );
  for (const config of approvedCrawlerConfigs) registerSpiderConfig(config);
  const approvedCrawlerBySourceId = new Map(
    approvedCrawlerConfigs
      .filter(isApprovedPublicPortalSpiderConfig)
      .map((config) => [config.sourceId, config]),
  );

  await publicPortalProvidersProvider.getStatus().catch(() => undefined);
  const allPersistedHealth = publicPortalProvidersProvider.getSourceStatuses();
  const healthBySourceId = new Map(
    allPersistedHealth.map((status) => [status.sourceId, status]),
  );

  const sources = ENRICHED_DIRECT_RFP_PORTALS.map(
    withPortalConnectorCapability,
  ).map((source) => {
    const approvedCrawler = approvedCrawlerBySourceId.get(source.id);
    const crawlerRunnable = Boolean(approvedCrawler);
    const runtimeRunnable = source.runtimeRunnable || crawlerRunnable;
    const registrationKind = source.registeredAdapter
      ? source.registrationKind
      : approvedCrawler?.kind === "json_endpoint"
        ? "approved_api"
        : approvedCrawler
          ? "vetted_extractor"
          : "none";
    const quarantine = runtimeRunnable
      ? portalQuarantineDecision(healthBySourceId.get(source.id))
      : { quarantined: false as const };

    return {
      ...source,
      connectorStatus: crawlerRunnable
        ? ("generic_extraction" as const)
        : source.connectorStatus,
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
      runtimeRunnable,
      registrationKind,
      unfinished: runtimeRunnable ? false : source.unfinished,
      quarantined: quarantine.quarantined,
      quarantineReason: quarantine.reason,
      quarantineReasonLabel: quarantine.reason
        ? portalQuarantineReasonLabel(quarantine.reason)
        : undefined,
    };
  });

  const runtimeSourceIds = new Set(
    sources
      .filter(
        (source) =>
          source.runtimeRunnable &&
          source.registrationKind !== "direct_api",
      )
      .map((source) => source.id),
  );

  const portalHealthSources = allPersistedHealth
    .filter((status) => runtimeSourceIds.has(status.sourceId))
    .map((status) => {
      const quarantine = portalQuarantineDecision(status);
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
        lifetimeResultCount: status.lifetimeResultCount,
        consecutiveNoResultSuccesses: status.consecutiveNoResultSuccesses,
        totalAttempts: status.totalAttempts,
        totalSuccesses: status.totalSuccesses,
        totalFailures: status.totalFailures,
        consecutiveFailures: status.consecutiveFailures,
        lastOutcome: quarantine.quarantined ? "quarantined" : status.lastOutcome,
        currentlyFailing,
        quarantined: quarantine.quarantined,
        quarantineReason: quarantine.reason,
        quarantineReasonLabel: quarantine.reason
          ? portalQuarantineReasonLabel(quarantine.reason)
          : undefined,
      };
    });

  const portalHealthSummary = portalHealthSources.reduce(
    (summary, status) => {
      summary.checked += 1;
      if (status.quarantined) summary.quarantined += 1;
      else if (status.currentlyFailing) summary.failing += 1;
      else if (status.lastOutcome === "success") summary.success += 1;
      else if (status.lastOutcome === "no_results") summary.noResults += 1;
      else if (status.lastOutcome === "validation_failed") {
        summary.validationFailed += 1;
      }
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

  const totals = sources.reduce(
    (acc, source) => {
      acc.total += 1;
      acc.byTier[source.tier] = (acc.byTier[source.tier] ?? 0) + 1;
      acc.byLevel[source.level] = (acc.byLevel[source.level] ?? 0) + 1;
      acc.byAccessMode[source.accessMode] =
        (acc.byAccessMode[source.accessMode] ?? 0) + 1;
      acc.byParserStatus[source.parserStatus] =
        (acc.byParserStatus[source.parserStatus] ?? 0) + 1;
      acc.byConnectorStatus[source.connectorStatus] =
        (acc.byConnectorStatus[source.connectorStatus] ?? 0) + 1;
      acc.byOccumedFit[source.occumedFit] =
        (acc.byOccumedFit[source.occumedFit] ?? 0) + 1;
      acc.byBuyerSector[source.buyerSector] =
        (acc.byBuyerSector[source.buyerSector] ?? 0) + 1;
      if (source.relevanceEvidenceUrls.length > 0) acc.withEvidence += 1;
      else acc.withoutEvidence += 1;
      if (source.registeredAdapter) acc.registeredAdapters += 1;
      if (source.runtimeRunnable && !source.quarantined) acc.runnable += 1;
      if (source.unfinished) acc.unfinished += 1;
      if (source.quarantined) acc.quarantined += 1;
      return acc;
    },
    {
      total: 0,
      byTier: {} as Record<string, number>,
      byLevel: {} as Record<string, number>,
      byAccessMode: {} as Record<string, number>,
      byParserStatus: {} as Record<string, number>,
      byConnectorStatus: {} as Record<string, number>,
      byOccumedFit: {} as Record<string, number>,
      byBuyerSector: {} as Record<string, number>,
      withEvidence: 0,
      withoutEvidence: 0,
      registeredAdapters: 0,
      runnable: 0,
      unfinished: 0,
      quarantined: 0,
    },
  );

  const catalogValidation = validateDirectRfpPortalRelevanceCatalog();
  const runtimePlan = getPublicPortalSearchPlanDiagnostics({
    includeTier3,
    fullCoverage,
    executionBudget,
    rotationKey,
  });
  const directory = buildProcurementPortalDirectory(sources);
  const inventory = buildPublicPortalRuntimeInventory(sources);

  const [crawlFrontier, discoveryCandidates] = await Promise.all([
    listCrawlFrontier().catch(() => [] as CrawlFrontierState[]),
    listDiscoveryCandidates().catch(() => [] as StoredDiscoveryCandidate[]),
  ]);
  const approvedCrawlerSourceIds = new Set(
    approvedCrawlerConfigs
      .filter(isApprovedPublicPortalSpiderConfig)
      .map((config) => config.sourceId),
  );
  const runtimeCrawlFrontier = crawlFrontier.filter((state) =>
    approvedCrawlerSourceIds.has(state.sourceId),
  );
  const spiderConfigs = listSpiderConfigs();
  const crawlerSummary = runtimeCrawlFrontier.reduce(
    (summary, state) => {
      summary.tracked += 1;
      summary.recordsFound += state.recordsFound;
      if (state.lastOutcome === "success") summary.success += 1;
      else if (state.lastOutcome === "no_results") summary.noResults += 1;
      else if (state.lastOutcome === "not_modified") summary.notModified += 1;
      else if (state.lastOutcome === "blocked") summary.blocked += 1;
      else if (state.lastOutcome === "failed") summary.failed += 1;
      return summary;
    },
    {
      tracked: 0,
      success: 0,
      noResults: 0,
      notModified: 0,
      blocked: 0,
      failed: 0,
      recordsFound: 0,
    },
  );

  const evidenceScanPlan = buildPortalEvidenceScanPlan({
    includeTier3,
    executionBudget,
    rotationKey,
  });

  res.json({
    totals,
    directory,
    inventory,
    health: {
      summary: portalHealthSummary,
      sources: portalHealthSources,
    },
    validation: catalogValidation,
    runtimePlan,
    crawler: {
      spiderKinds: listSpiderKinds(),
      spiderConfigs,
      approvedConfigs: approvedCrawlerConfigs,
      frontier: runtimeCrawlFrontier,
      summary: crawlerSummary,
      discoveryCandidates,
    },
    evidenceScanPlan,
  });
});

router.post("/rfp-sources/evidence-scan", async (req, res) => {
  try {
    const result = await scanPortalEvidence({
      portalIds: Array.isArray(req.body?.portalIds)
        ? req.body.portalIds.map(String)
        : undefined,
      includeTier3: req.body?.includeTier3 !== false,
      executionBudget: Number(req.body?.executionBudget ?? 6) || 6,
      rotationKey:
        typeof req.body?.rotationKey === "string"
          ? req.body.rotationKey
          : undefined,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
