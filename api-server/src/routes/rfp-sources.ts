import { Router } from "express";
import { DIRECT_RFP_PORTALS } from "../lib/providers/directRfpPortals";

const router = Router();

/**
 * GET /api/rfp-sources
 * Returns the direct official RFP portal catalog used to seed/parser-plan
 * direct-source ingestion. This is metadata only; it does not call or scrape
 * any portal.
 */
router.get("/rfp-sources", async (_req, res) => {
  const totals = DIRECT_RFP_PORTALS.reduce(
    (acc, source) => {
      acc.total++;
      acc.byTier[source.tier] = (acc.byTier[source.tier] ?? 0) + 1;
      acc.byLevel[source.level] = (acc.byLevel[source.level] ?? 0) + 1;
      acc.byAccessMode[source.accessMode] = (acc.byAccessMode[source.accessMode] ?? 0) + 1;
      acc.byParserStatus[source.parserStatus] = (acc.byParserStatus[source.parserStatus] ?? 0) + 1;
      return acc;
    },
    {
      total: 0,
      byTier: {} as Record<string, number>,
      byLevel: {} as Record<string, number>,
      byAccessMode: {} as Record<string, number>,
      byParserStatus: {} as Record<string, number>,
    },
  );

  return res.json({
    sources: DIRECT_RFP_PORTALS,
    totals,
    rules: {
      includes: ["official federal/state/district/international procurement portals"],
      excludes: ["BidNet", "DemandStar", "GovWin", "PlanetBids", "OpenGov network pages", "Periscope/S2G", "generic search providers"],
      ingestionPriority: ["direct official portals", "quality gate", "staging", "validated opportunities", "search/AI enrichment only after cheap filters"],
    },
  });
});

export default router;
