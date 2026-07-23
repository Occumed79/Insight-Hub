import { Router } from "express";
import {
  listCrawlFrontier,
  listDiscoveryCandidates,
  listSpiderConfigs,
  listSpiderKinds,
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
import {
  buildProcurementPortalDirectory,
  buildProcurementPortalInventory,
} from "../lib/providers/portalDirectory";
import { withPortalConnectorCapability } from "../lib/providers/portalCapabilities";
import { publicPortalProvidersProvider } from "../lib/providers/publicPortalProviders";
import {
  portalQuarantineDecision,
  portalQuarantineReasonLabel,
} from "../lib/providers/publicPortalProviders/portalHealthStore";

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

  const sources = ENRICHED_DIRECT_RFP_PORTALS.map(
    withPortalConnectorCapability,
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
  const inventory = buildProcurementPortalInventory(sources);

  // Hydrate the durable per-portal status cache before serializing it. Failure
  // to read health must never make the source inventory endpoint unavailable.
  await publicPortalProvidersProvider.getStatus().catch(() => undefined);
  const portalHealthSources = publicPortalProvidersProvider
    .getSourceStatuses()
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
        consecutiveEmptyResults: status.consecutiveEmptyResults,
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

  const [crawlFrontier, discoveryCandidates] = await Promise.all([
    listCrawlFrontier().catch(() => [] as CrawlFrontierState[]),
    listDiscoveryCandidates().catch(() => [] as StoredDiscoveryCandidate[]),
  ]);
  const spiderConfigs = listSpiderConfigs();
  const crawlerSummary = crawlFrontier.reduce(
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
        startUrls: config.startUrls,
        allowedHosts: config.allowedHosts,
        scheduleMinutes: config.scheduleMinutes,
        limits: config.limits,
        notes: config.notes,
      })),
      summary: crawlerSummary,
      frontier: crawlFrontier,
      discoveryCandidates,
    },
    totals: {
      ...totals,
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
        "official federal/state/district/international procurement portals",
        "Occu-Med fit classification based on official evidence or buyer propensity",
      ],
      excludes: [
        "BidNet",
        "DemandStar",
        "GovWin",
        "PlanetBids marketplace pages",
        "OpenGov network pages",
        "Periscope/S2G",
        "generic search providers",
      ],
      ingestionPriority: [
        "verified_high",
        "likely",
        "broad",
        "insufficient_evidence",
        "irrelevant",
      ],
      connectorStatusPolicy: {
        direct_api: "Dedicated official structured API",
        direct_adapter: "Portal-specific official listing adapter",
        generic_extraction:
          "Generic one-page link/text extraction without portal-specific pagination",
        serper_discovery:
          "Official-domain discovery through Serper; not a direct connector",
        directory_only: "Manual directory link with no automated collection",
        stub: "Scaffold only; collection is not implemented",
      },
      coveragePolicy:
        "Catalog inclusion proves an official source link only. connectorStatus reports the automation that actually exists; parserStatus remains legacy catalog-planning metadata and must not be presented as completed coverage.",
      crawlerPolicy:
        "Crawler spiders are bounded to official allowed hosts, preserve durable frontier state, use conditional requests and backoff, and do not bypass authentication, CAPTCHAs, robots rules, or explicit access controls.",
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
