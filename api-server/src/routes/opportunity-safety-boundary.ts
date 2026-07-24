import { Router } from "express";
import { and, asc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { rfpDb as db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { classifyResult } from "../lib/search/relevance";
import {
  OpportunityQualityPageAccumulator,
  type OpportunityViewMode,
} from "../lib/opportunityQuality";
import {
  opportunityListErrorDetail,
  opportunityListSelection,
} from "./opportunityListQuery";

const router = Router();
const VIEW_MODES = new Set<OpportunityViewMode>([
  "actionable",
  "needs-verification",
  "closed",
  "all",
]);

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw
      .split(/[,;|]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
}

function relevanceView(opp: Record<string, any>) {
  const classification = classifyResult({
    title: opp.title,
    snippet: [
      opp.type,
      opp.solicitationNumber,
      opp.description,
      opp.agency,
      opp.subAgency,
    ]
      .filter(Boolean)
      .join(" "),
    url: opp.samUrl,
    date: opp.postedDate,
    deadlineInFuture: Boolean(
      opp.responseDeadline &&
      new Date(opp.responseDeadline).getTime() > Date.now(),
    ),
    allowHistorical: true,
  });
  const tags = parseTags(opp.tags);
  const storedScore = Number(opp.relevanceScore);
  const score = Number.isFinite(storedScore)
    ? Math.round(storedScore)
    : classification.score;
  const dateUnknown =
    tags.includes("date-unknown") ||
    !opp.postedDate ||
    new Date(opp.postedDate).getTime() <= 0;
  const confidence =
    opp.sourceConfidence === "high" ||
    opp.sourceConfidence === "medium" ||
    opp.sourceConfidence === "low"
      ? opp.sourceConfidence
      : score >= 75
        ? "high"
        : score >= 50
          ? "medium"
          : "low";
  return {
    score,
    reasons: classification.reasons.slice(0, 4),
    category: classification.category,
    dateUnknown,
    stale: tags.includes("stale") || classification.stale,
    confidence,
    feedbackScore:
      opp.userConfidence == null ? null : Number(opp.userConfidence),
    feedbackAdj: 0,
    semanticSimilarity: null,
    postedDate: dateUnknown ? null : opp.postedDate,
  };
}

function mapOpportunity(opp: Record<string, any>) {
  return {
    ...opp,
    awardAmount: opp.awardAmount ? Number(opp.awardAmount) : undefined,
    estimatedValue: opp.estimatedValue
      ? Number(opp.estimatedValue)
      : undefined,
    ceilingValue: opp.ceilingValue ? Number(opp.ceilingValue) : undefined,
    floorValue: opp.floorValue ? Number(opp.floorValue) : undefined,
    relevanceScore: opp.relevanceScore
      ? Number(opp.relevanceScore)
      : undefined,
    tags: parseTags(opp.tags),
    relevance: relevanceView(opp),
  };
}

/**
 * Canonical list boundary. The former route applied an unrelated hard-reject
 * dictionary in SQL before the quality-view classifier, which hid accepted
 * records and made view=all incomplete. This boundary keeps only user-requested
 * field filters in SQL and delegates actionability to one quality classifier.
 */
router.get("/opportunities", async (req, res) => {
  try {
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const type = String(req.query.type ?? "").trim();
    const agency = String(req.query.agency ?? "").trim();
    const source = String(req.query.source ?? "").trim();
    const viewRaw = String(req.query.view ?? "actionable").trim();
    const view: OpportunityViewMode = VIEW_MODES.has(
      viewRaw as OpportunityViewMode,
    )
      ? (viewRaw as OpportunityViewMode)
      : "actionable";
    const page = Math.max(
      1,
      Number.parseInt(String(req.query.page ?? "1"), 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50),
    );
    const dateRange = Number.parseInt(String(req.query.dateRange ?? ""), 10);
    const freshOnly = String(req.query.freshOnly ?? "") === "true";

    const conditions: any[] = [];
    if (status === "active" || status === "archived") {
      conditions.push(eq(opportunitiesTable.status, status));
    }
    if (type) conditions.push(ilike(opportunitiesTable.type, `%${type}%`));
    if (agency) conditions.push(ilike(opportunitiesTable.agency, `%${agency}%`));
    if (source) {
      const sourceAliases: Record<string, string[]> = {
        sam_gov: ["samGov", "sam_gov"],
        samGov: ["samGov", "sam_gov"],
        statePortals: ["publicPortalProviders"],
        publicPortalProviders: ["publicPortalProviders"],
      };
      const keys = sourceAliases[source] ?? [source];
      conditions.push(
        or(
          ...keys.flatMap((key) => [
            eq(opportunitiesTable.providerKey, key),
            eq(opportunitiesTable.providerName, key),
          ]),
        ),
      );
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(opportunitiesTable.title, pattern),
          ilike(opportunitiesTable.agency, pattern),
          ilike(opportunitiesTable.description, pattern),
          ilike(opportunitiesTable.solicitationNumber, pattern),
        ),
      );
    }
    if (Number.isFinite(dateRange) && dateRange > 0) {
      conditions.push(
        gt(
          opportunitiesTable.postedDate,
          new Date(Date.now() - dateRange * 86_400_000),
        ),
      );
    }
    if (freshOnly) {
      conditions.push(
        sql`coalesce(${opportunitiesTable.tags}, '') not ilike '%stale%'`,
      );
    }

    const rows = await db
      .select(opportunityListSelection(opportunitiesTable))
      .from(opportunitiesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(
        asc(
          sql`case when ${opportunitiesTable.responseDeadline} is null then 1 else 0 end`,
        ),
        asc(opportunitiesTable.responseDeadline),
        asc(opportunitiesTable.title),
      );

    const accumulator = new OpportunityQualityPageAccumulator(
      view,
      page,
      limit,
    );
    for (const row of rows) accumulator.add(row);
    const qualityPage = accumulator.finish();
    return res.json({
      data: qualityPage.data.map((item) => ({
        ...mapOpportunity(item),
        quality: item.quality,
      })),
      total: qualityPage.total,
      page,
      limit,
      view,
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({
      error: "Failed to list opportunities",
      details: opportunityListErrorDetail(error),
    });
  }
});

// Bulk deletion contradicts the raw -> staging -> canonical audit contract.
// Historical canonical data is preserved; future junk is rejected/quarantined.
router.post("/opportunities/purge-junk", (_req, res) =>
  res.status(410).json({
    error: "Purge Junk is disabled.",
    reason:
      "The ingestion pipeline retains rejected evidence in staging and never bulk-deletes canonical production records.",
  }),
);

export default router;
