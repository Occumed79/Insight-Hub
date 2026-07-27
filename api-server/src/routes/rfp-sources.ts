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

  // Hydrate durable adapter health before runtime classification. Historical
  // catalog-only rows remain stored for audit but are excluded below.
  await publicPortalProvidersProvider.getStatus().catch(() => undefined);
  const allPersistedHealth = publicPortalProvidersProvider.getSourceStatuses();
  const healthBySourceId = new Map(
    allPersistedHealth.map((status) => [status.sourceId, status]),
  );

  const sources = ENRICHED_DIRECT_RFP_PORTALS.map(
    withPortalConnectorCapability,
  ).map((source) => {
    const approvedCrawler = approvedCrawlerBySourceId.get(source.id);
    const crawlerRunnable = Boolean(approvedCrawler) && !source.disabled;
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
      if (source.disabled) acc.disabled += 1;
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
      disabled: 0,
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

  return res.json({
    sources,
    directory,
    inventory,
    health: {
      summary: portalHealthSummary,
      sources: portalHealthSources,
    },
    crawler: {
      spiderKinds: listSpiderKinds(),
      configs: spiderConfigs.map((config) => ({
        id: config.id,
        sourceId: config.sourceId,
        kind: config.kind,
        enabled: config.enabled,
        runtimeApproved: isApprovedPublicPortalSpiderConfig(config),
        startUrls: config.startUrls,
        allowedHosts: config.allowedHosts,
        scheduleMinutes: config.scheduleMinutes,
        limits: config.limits,
        notes: config.notes,
      })),
      summary: crawlerSummary,
      frontier: runtimeCrawlFrontier,
      discoveryCandidates,
    },
    totals: {
      ...totals,
      cataloguedCount: totals.total,
      registeredAdapterCount: totals.registeredAdapters,
      runnableCount: totals.runnable,
      unfinishedCount: totals.unfinished,
      disabledCount: totals.disabled,
      quarantinedCount: totals.quarantined,
      verifiedHighCount: totals.byOccumedFit.verified_high ?? 0,
      likelyCount: totals.byOccumedFit.likely ?? 0,
      broadCount: totals.byOccumedFit.broad ?? 0,
      insufficientEvidenceCount:
        totals.byOccumedFit.insufficient_evidence ?? 0,
      irrelevantCount: totals.byOccumedFit.irrelevant ?? 0,
      unclassifiedCount: totals.byOccumedFit.unclassified ?? 0,
    },
    relevanceValidation: catalogValidation,
    runtimePlan,
    rules: {
      includes: [
        "official federal/state/district/international procurement portals as catalog metadata",
        "Occu-Med fit classification based on official evidence or buyer propensity",
      ],
      excludes: [
        "catalog-only execution",
        "needs-parser execution",
        "automatic generic extraction inferred from a URL or public_html access mode",
        "capability inflation from catalog size",
      ],
      ingestionPriority: [
        "registered_adapter",
        "approved_official_api",
        "deliberately_vetted_extractor",
      ],
      connectorStatusPolicy: {
        direct_api: "Dedicated official structured API",
        direct_adapter: "Source-specific adapter present in the runtime registry",
        generic_extraction:
          "Explicitly approved official endpoint or deliberately vetted extractor",
        serper_discovery:
          "Global web discovery only; never source-specific connection authority",
        directory_only: "Catalog metadata and manual link only",
        stub: "Unfinished source with no runtime collection authority",
      },
      coveragePolicy:
        "The catalog is metadata and inventory only. Only the adapter registry, an approved official API registration, or a deliberately vetted extractor can make a source runnable.",
      nonNegotiableRule:
        "No registered adapter, approved official API, or deliberately vetted extractor means no ingestion.",
      healthPolicy:
        "Health, yield, failure, and crawler summaries include runtime-authorized sources only. Historical catalog-only health rows remain persisted for audit but do not inflate capability or failure counts.",
      crawlerPolicy:
        "Crawler spiders are bounded to official allowed hosts and execute only after explicit approval; catalog scraperType and URL fields never self-authorize a crawler.",
    },
  });
});

router.get("/rfp-sources/evidence-scan/plan", async (req, res) => {
  const portalIds =
    typeof req.query.portalIds === "string"
      ? req.query.portalIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined;
  const includeTier3 = String(req.query.includeTier3 ?? "true") === "true";
  const includeHistorical =
    String(req.query.includeHistorical ?? "false") === "true";
  const historicalYears = Number(req.query.historicalYears ?? 5);
  const fullCoverage = String(req.query.fullCoverage ?? "false") === "true";
  const executionBudget = Number(req.query.executionBudget ?? 12);
  const rotationKey =
    typeof req.query.rotationKey === "string"
      ? req.query.rotationKey
      : undefined;

  const plan = buildPortalEvidenceScanPlan({
    portalIds,
    includeTier3,
    includeHistorical,
    historicalYears: Number.isFinite(historicalYears) ? historicalYears : 5,
    fullCoverage,
    executionBudget: Number.isFinite(executionBudget) ? executionBudget : 12,
    rotationKey,
  });

  return res.json({
    diagnostics: plan.diagnostics,
    selectedQueries: plan.selectedQueries,
  });
});

router.post("/rfp-sources/evidence-scan", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const portalIds = Array.isArray(body.portalIds)
    ? body.portalIds.filter(
        (value): value is string => typeof value === "string",
      )
    : undefined;
  const includeTier3 = body.includeTier3 !== false;
  const includeHistorical = body.includeHistorical === true;
  const historicalYears = Number(body.historicalYears ?? 5);
  const fullCoverage = body.fullCoverage === true;
  const executionBudget = Number(body.executionBudget ?? 12);
  const resultsPerQuery = Number(body.resultsPerQuery ?? 5);
  const rotationKey =
    typeof body.rotationKey === "string" ? body.rotationKey : undefined;

  const result = await scanPortalEvidence({
    portalIds,
    includeTier3,
    includeHistorical,
    historicalYears: Number.isFinite(historicalYears) ? historicalYears : 5,
    fullCoverage,
    executionBudget: Number.isFinite(executionBudget) ? executionBudget : 12,
    resultsPerQuery: Number.isFinite(resultsPerQuery) ? resultsPerQuery : 5,
    rotationKey,
  });

  return res.status(result.configured ? 200 : 503).json(result);
});

export default router;
