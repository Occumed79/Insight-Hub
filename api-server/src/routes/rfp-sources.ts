import { Router } from "express";
import {
  ENRICHED_DIRECT_RFP_PORTALS,
  validateDirectRfpPortalRelevanceCatalog,
} from "../lib/providers/directRfpPortalRelevanceCatalog";
import { scanPortalEvidence } from "../lib/providers/portalEvidenceScanner";
import { getStatePortalSearchPlanDiagnostics } from "../lib/providers/statePortals";

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

  const totals = ENRICHED_DIRECT_RFP_PORTALS.reduce(
    (acc, source) => {
      acc.total += 1;
      acc.byTier[source.tier] = (acc.byTier[source.tier] ?? 0) + 1;
      acc.byLevel[source.level] = (acc.byLevel[source.level] ?? 0) + 1;
      acc.byAccessMode[source.accessMode] =
        (acc.byAccessMode[source.accessMode] ?? 0) + 1;
      acc.byParserStatus[source.parserStatus] =
        (acc.byParserStatus[source.parserStatus] ?? 0) + 1;
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
      byOccumedFit: {} as Record<string, number>,
      byBuyerSector: {} as Record<string, number>,
      withEvidence: 0,
      withoutEvidence: 0,
    },
  );

  const catalogValidation = validateDirectRfpPortalRelevanceCatalog();
  const runtimePlan = getStatePortalSearchPlanDiagnostics({
    includeTier3,
    fullCoverage,
    executionBudget,
    rotationKey,
  });

  return res.json({
    sources: ENRICHED_DIRECT_RFP_PORTALS,
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
      coveragePolicy:
        "A finite execution query budget rotates deterministically through the complete eligible portal and ontology-query plan; fullCoverage=true returns the complete execution plan without introducing a permanent source cap.",
    },
  });
});

router.post("/rfp-sources/evidence-scan", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const portalIds = Array.isArray(body.portalIds)
    ? body.portalIds.filter((value): value is string => typeof value === "string")
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
