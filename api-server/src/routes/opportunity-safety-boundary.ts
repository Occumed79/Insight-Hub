import { Router } from "express";
import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { rfpDb as db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { classifyResult } from "../lib/search/relevance";
import {
  canonicalSamOpportunityUrl,
  classifyOpportunityQuality,
  calculateOpportunityRank,
  qualityMatchesView,
  type OpportunityViewMode,
} from "../lib/opportunityQuality";
import { contextualAdjustments } from "../lib/learning/contextualFeedback";
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
const FEEDBACK_RANK_WEIGHT = 15;
const MAX_RANKING_CANDIDATES = 10_000;

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

function feedbackAdjustment(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const delta = ((parsed - 50) / 50) * FEEDBACK_RANK_WEIGHT;
  return Math.round(
    Math.max(-FEEDBACK_RANK_WEIGHT, Math.min(FEEDBACK_RANK_WEIGHT, delta)),
  );
}

function sourceAuthority(provider: unknown): {
  label: "official" | "structured" | "discovery" | "other";
  bonus: number;
} {
  const value = String(provider ?? "").toLowerCase();
  if (value === "samgov" || value === "sam_gov") {
    return { label: "official", bonus: 240 };
  }
  if (value === "internationalpublicportals") {
    return { label: "official", bonus: 220 };
  }
  if (value === "tango") return { label: "structured", bonus: 180 };
  if (
    [
      "langsearch",
      "serper",
      "exa",
      "parallel",
      "linkup",
      "you",
      "socrata",
      "websearch",
      "aidiscovery",
    ].includes(value)
  ) {
    return { label: "discovery", bonus: 20 };
  }
  return { label: "other", bonus: 0 };
}

function crossSourceKey(row: Record<string, any>): string {
  const solicitation = String(row.solicitationNumber ?? row.noticeId ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (solicitation) {
    const agency = String(row.agency ?? "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    return `sol:${agency}:${solicitation}`;
  }
  const canonicalUrl = canonicalSamOpportunityUrl(row.samUrl);
  if (canonicalUrl) return `url:${canonicalUrl.toLowerCase()}`;
  return `id:${row.id}`;
}

function relevanceView(opp: Record<string, any>, contextualAdjustment = 0) {
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
  const score = classification.score;
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
  const globalAdjustment = feedbackAdjustment(opp.userConfidence);
  return {
    score,
    reasons: classification.reasons.slice(0, 4),
    category: classification.category,
    dateUnknown,
    stale: tags.includes("stale") || classification.stale,
    confidence,
    feedbackScore:
      opp.userConfidence == null ? null : Number(opp.userConfidence),
    feedbackAdj: globalAdjustment + contextualAdjustment,
    globalFeedbackAdj: globalAdjustment,
    contextualFeedbackAdj: contextualAdjustment,
    semanticSimilarity: null as number | null,
    postedDate: dateUnknown ? null : opp.postedDate,
  };
}

function mapOpportunity(opp: Record<string, any>, contextualAdjustment = 0) {
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
    relevance: relevanceView(opp, contextualAdjustment),
  };
}

router.get("/opportunities", async (req, res) => {
  try {
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const type = String(req.query.type ?? "").trim();
    const naicsCode = String(req.query.naicsCode ?? "").trim();
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
    const rankingNow = new Date();

    const conditions: any[] = [];
    if (status === "active" || status === "archived") {
      conditions.push(eq(opportunitiesTable.status, status));
    }
    if (type) conditions.push(ilike(opportunitiesTable.type, `%${type}%`));
    if (naicsCode) conditions.push(eq(opportunitiesTable.naicsCode, naicsCode));
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
    if (view !== "all") {
      conditions.push(
        sql`coalesce(${opportunitiesTable.userGrade}, '') <> 'spam'`,
      );
    }

    // Preserve a hard memory/CPU safety bound, but make admission fit-first
    // instead of recency-first. The old newest-first LIMIT could hide an older
    // still-open high-fit solicitation before the real ranking engine saw it.
    // Actionable/All views reserve admission priority for deadlines that are
    // today or later, then rank that pool by persisted relevance; recency is
    // only a secondary tie-breaker. The final quality classifier still decides
    // exact deadline validity, preserving date-only end-of-day semantics.
    const candidateCap = MAX_RANKING_CANDIDATES;
    const prioritizeOpenCandidates = view === "actionable" || view === "all";
    const candidateOrder = prioritizeOpenCandidates
      ? [
          sql`CASE
            WHEN ${opportunitiesTable.responseDeadline} >= date_trunc('day', ${rankingNow}::timestamptz) THEN 0
            WHEN ${opportunitiesTable.responseDeadline} IS NULL THEN 1
            ELSE 2
          END ASC`,
          sql`${opportunitiesTable.relevanceScore} DESC NULLS LAST`,
          sql`${opportunitiesTable.postedDate} DESC NULLS LAST`,
          asc(opportunitiesTable.id),
        ]
      : [
          sql`${opportunitiesTable.relevanceScore} DESC NULLS LAST`,
          sql`${opportunitiesTable.postedDate} DESC NULLS LAST`,
          asc(opportunitiesTable.id),
        ];

    // Fetch one extra row so truncation is reported only when there are truly
    // more candidates than the safety window (not when there are exactly 10k).
    const candidateRows = await db
      .select(opportunityListSelection(opportunitiesTable))
      .from(opportunitiesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(...candidateOrder)
      .limit(candidateCap + 1);
    const truncated = candidateRows.length > candidateCap;
    const rows = candidateRows.slice(0, candidateCap);

    const context = await contextualAdjustments(rows, search || undefined);
    const best = new Map<
      string,
      {
        item: any;
        rank: number;
        authority: ReturnType<typeof sourceAuthority>;
        contextHash: string;
      }
    >();

    for (const row of rows) {
      const quality = classifyOpportunityQuality(row);
      if (!qualityMatchesView(quality, view)) continue;
      const contextual = context.get(String(row.id)) ?? {
        adjustment: 0,
        context: "",
        contextHash: "",
      };
      const mapped = mapOpportunity(row, contextual.adjustment);
      const authority = sourceAuthority(row.providerName ?? row.source);
      const rankBreakdown = calculateOpportunityRank(row, quality);
      // Contextual learning is deliberately bounded and scope-specific: one
      // poor result cannot poison a provider or overpower procurement fit.
      const contextualFeedback = Math.max(-5, Math.min(5, contextual.adjustment));
      const rank = Math.max(0, Math.min(100,
        rankBreakdown.finalRankScore + contextualFeedback));
      const key = crossSourceKey(row);
      const existing = best.get(key);
      const canonicalWins = !existing ||
        authority.bonus > existing.authority.bonus ||
        (authority.bonus === existing.authority.bonus && rank > existing.rank);
      if (canonicalWins) {
        const groupRank = Math.max(rank, existing?.rank ?? 0);
        best.set(key, {
          item: {
            ...mapped,
            quality,
            crossSource: {
              canonicalKey: key,
              rank: groupRank,
              rankBreakdown: {
                ...rankBreakdown,
                contextualFeedbackAdjustment: contextualFeedback,
                finalRankScore: groupRank,
              },
              authority: authority.label,
              contextHash: contextual.contextHash,
              suppressed: row.userGrade === "spam",
            },
          },
          rank: groupRank,
          authority,
          contextHash: contextual.contextHash,
        });
      } else if (existing && rank > existing.rank) {
        // Secondary discovery evidence may strengthen group ranking without
        // stealing canonical ownership from the authoritative record.
        existing.rank = rank;
        existing.item.crossSource.rank = rank;
        existing.item.crossSource.rankBreakdown.finalRankScore = rank;
      }
    }

    const sorted = Array.from(best.values()).sort((left, right) => {
      if (right.rank !== left.rank) return right.rank - left.rank;
      return String(left.item.title).localeCompare(String(right.item.title));
    });
    const total = sorted.length;
    const offset = (page - 1) * limit;
    const data = sorted.slice(offset, offset + limit).map((row) => row.item);

    return res.json({
      data,
      total,
      page,
      limit,
      view,
      ranking: {
        mode: "best-match-v3",
        candidateStrategy: prioritizeOpenCandidates
          ? "open-then-fit-v1"
          : "fit-then-recency-v1",
        candidateCount: rows.length,
        candidateCap,
        truncated,
        canonicalCount: total,
        queryContext: search || null,
      },
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({
      error: "Failed to list opportunities",
      details: opportunityListErrorDetail(error),
    });
  }
});

router.post("/opportunities/purge-junk", (_req, res) =>
  res.status(410).json({
    error: "Purge Junk is disabled.",
    reason:
      "The ingestion pipeline retains rejected evidence in staging and never bulk-deletes canonical production records.",
  }),
);

export default router;
