import { Router } from "express";
import { rfpDb as db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq, ilike, and, or, sql, isNull, desc, count as countFn } from "drizzle-orm";
import { importFromCsv } from "../lib/csv-service";
import { tavilyProvider } from "../lib/providers/tavily";
import { groqProvider } from "../lib/providers/groq";
import { openrouterProvider } from "../lib/providers/openrouter";
import { extractMetadataFromText } from "../lib/search/heuristicExtract";
import { classifyResult } from "../lib/search/relevance";
import { semanticRerank, isSemanticRerankEnabled } from "../lib/search/semanticRerank";
import {
  getCurrentIngestionRun,
  getIngestionRun,
  IngestionRunNotRetryableError,
  listRecentIngestionRuns,
  reconcileExpiredOpportunities,
  retryFailedProviders,
  startManualIngestion,
} from "../lib/ingestion/manualIngestion";
import { createStartIngestionHandler } from "./opportunityIngestionHandlers";
import {
  boundNumeric,
  likeAnyText,
  notLikeAnyText,
  opportunityListErrorDetail,
  opportunityListSelection,
} from "./opportunityListQuery";
import multer from "multer";
import { classifyOpportunityQuality, opportunityQualityRank, qualityMatchesView, type OpportunityViewMode } from "../lib/opportunityQuality";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

// Max points the feedback-learned signal (userConfidence, 0-100, neutral 50)
// can add to or subtract from a result's ranking score. 0 when no grades exist.
const FEEDBACK_RANK_WEIGHT = 15;

// Convert a stored userConfidence (0-100, neutral 50) into a ranking delta
// in [-FEEDBACK_RANK_WEIGHT, +FEEDBACK_RANK_WEIGHT]. Null/neutral → 0 (no-op).
function feedbackAdjustment(userConfidence: unknown): number {
  const uc = typeof userConfidence === "string" ? parseFloat(userConfidence)
    : typeof userConfidence === "number" ? userConfidence : NaN;
  if (!Number.isFinite(uc)) return 0;
  const delta = ((uc - 50) / 50) * FEEDBACK_RANK_WEIGHT;
  return Math.max(-FEEDBACK_RANK_WEIGHT, Math.min(FEEDBACK_RANK_WEIGHT, delta));
}

// ── Hard-reject: ANY match → discard immediately ──────────────────────────────
// Expanded significantly to block all the junk categories that keep slipping through.
const HARD_REJECT_SIGNALS = [
  // Emergency / EMS
  "ambulance", "emergency medical services", " ems ", "paramedic", "emt ", "first responder",
  // Nursing / staffing noise
  "lvn", "lpn", "registered nurse", " rn ", "nursing services", "nurse staffing",
  "medical staffing", "staff augmentation", "temporary staffing", "per diem staff",
  "locum", "travel nurse",
  // Job postings (not contracts)
  "job posting", "job opening", "career opportunity", "now hiring", " hiring ",
  "position available", "employment opportunity", "job advertisement", "job vacancy",
  "we are looking for", "apply now", "submit resume", "send resume",
  // Blanket / consulting noise
  "blanket purchase agreement", "regional medical consultant", "medical consultant",
  "disability adjudication", "disability determination", "social security disability",
  "independent medical examination", "ime panel",
  // Pharmacy / dispensing / lab
  "pharmacy", "pharmaceutical", "marijuana", "cannabis", "dispensary",
  "phlebotomist", "perfusion", "ray tech", "x-ray tech", "radiology technologist",
  "mri tech", "ct tech", "sonographer", "ultrasound technologist",
  "dental assistant", "dental hygienist", "dental care",
  // Behavioral / mental health
  "mental health therapy", "behavioral health treatment", "substance abuse treatment",
  "addiction treatment", "detox program", "psychiatric", "psychotherapy",
  "counseling services", "crisis intervention", "suicide prevention",
  "childrens mental health", "children's mental health",
  // Insurance / claims / benefits admin
  "health insurance", "health benefits", "claims administration", "claims data",
  "medical claims", "insurance enrollment", "benefits administration",
  "cobra administration", "hmo", "health plan",
  // Already awarded / closed
  "contract awarded", "award notice", "awarded to", "selected vendor",
  "notice of award", "bid tabulation", "intent to award", "sole source award",
  "contract modification", "delivery order", "task order modification",
  // Nutrition / food / non-occ-health
  "nutrition program", "food service", "meal delivery", "wic program",
  "school lunch", "head start nutrition",
  // IT / software (not medical)
  "electronic health record", "ehr implementation", "emr system", "hospital information",
  "telehealth platform", "telemedicine software",
  // Misc junk
  "seaborn", "needed", "veterinary", "animal health", "pest control",
  "janitorial", "landscaping", "construction",
];

// ── Must have at least ONE of these to pass ───────────────────────────────────
// Tightened to Occu-Med's actual service lines only.
const OCCUMED_SERVICE_SIGNALS = [
  // Core occupational health
  "occupational health", "occupational medicine", "occupational health services",
  "occupational medical", "occ health", "occmed",
  // Drug & alcohol testing
  "drug testing", "drug screening", "drug test", "alcohol testing",
  "dot drug", "dot alcohol", "substance abuse testing", "random drug testing",
  "urine drug screen", "hair follicle test", "breath alcohol",
  // Physical examinations
  "dot physical", "dot examination", "dot medical", "fmcsa physical",
  "pre-employment physical", "pre employment physical", "pre-placement physical",
  "annual physical", "periodic medical", "medical fitness",
  "return to work physical", "return to duty physical",
  // Employee health programs
  "employee health services", "employee health program", "workplace health",
  "workforce health", "worker health screening",
  // Surveillance & monitoring
  "medical surveillance", "health surveillance", "biological monitoring",
  "bloodborne pathogen", "hazmat medical", "hazardous material medical",
  // Fitness for duty
  "fit for duty", "fitness for duty", "work capacity evaluation",
  "functional capacity", "work hardening",
  // Respiratory / pulmonary
  "respirator fit", "respirator fit test", "fit testing", "pulmonary function",
  "spirometry", "pfft", "quantitative fit",
  // Hearing / audiometry
  "audiogram", "audiometric", "hearing conservation", "hearing test",
  "noise-induced hearing",
  // Immunization / preventive
  "vaccination", "immunization", "flu shot", "influenza vaccination",
  "titer", "tb test", "tuberculosis testing", "ppd test", "quantiferon",
  "covid testing", "respirator medical evaluation",
  // Military / government specific
  "deployment medical", "pre-deployment", "periodic health assessment",
  "separation physical", "military physical", "pha exam",
];

function normalizeForQuality(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
}

function hasSignal(text: string, signals: string[]): boolean {
  return signals.some((signal) => text.includes(normalizeForQuality(signal)));
}

function hasStaleYearOnly(raw: string): boolean {
  const years = Array.from(raw.matchAll(/\b20\d{2}\b/g)).map((m) => Number(m[0]));
  if (years.length === 0) return false;
  const hasCurrentOrFuture = years.some((year) => year >= CURRENT_YEAR && year <= NEXT_YEAR + 1);
  const hasOld = years.some((year) => year < CURRENT_YEAR);
  return hasOld && !hasCurrentOrFuture;
}

function shouldShowOpportunity(opp: any): boolean {
  const raw = [
    opp.title,
    opp.description,
    opp.agency,
    opp.providerName,
    opp.source,
    opp.solicitationNumber,
    opp.samUrl,
  ].filter(Boolean).join(" ");
  const text = normalizeForQuality(raw);

  // Reject untitled / suspiciously short titles
  const title = (opp.title ?? "").trim();
  if (title.length < 10) return false;

  // Reject stale-year-only records (old archived RFPs from past years)
  if (hasStaleYearOnly(raw)) return false;

  // Hard reject — any match on these = instant discard
  if (hasSignal(text, HARD_REJECT_SIGNALS)) return false;

  // Must match at least one Occu-Med service signal
  if (!hasSignal(text, OCCUMED_SERVICE_SIGNALS)) return false;

  // Extra: reject if title alone contains obvious job-ad language
  const titleNorm = normalizeForQuality(title);
  const JOB_TITLE_SIGNALS = [" wanted", " needed", "apply ", "we are hiring", "position ", "vacancy"];
  if (JOB_TITLE_SIGNALS.some(s => titleNorm.includes(s))) return false;

  return true;
}

// Shared with enrichment and read-time presentation. Manual ingestion applies
// its quality decision before any record can be promoted into production.
export { shouldShowOpportunity };

function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Build the transparent relevance view shown in the UI: a 0-100 score, the
 * human-readable reasons it matched, the detected/`unknown` date, and quality
 * warnings (stale / low-confidence). Uses stored values when present (web rows
 * scored at write time) and falls back to live classification for older rows.
 */
function buildRelevanceView(opp: any) {
  const cls = classifyResult({
    title: opp.title,
    snippet: opp.description,
    url: opp.samUrl,
    date: opp.postedDate,
    allowHistorical: true,
  });

  const tags = parseTags(opp.tags);
  const storedScore = opp.relevanceScore != null ? parseFloat(opp.relevanceScore) : NaN;
  const score = Number.isFinite(storedScore) ? Math.round(storedScore) : cls.score;

  const storedReasons = typeof opp.notes === "string"
    ? opp.notes.split(/;|·/).map((s: string) => s.trim()).filter(Boolean)
    : [];
  const baseReasons = storedReasons.length ? storedReasons : cls.reasons;

  // Feedback-learned signal (from graded opportunities) folded into ranking.
  const feedbackScore = typeof opp.userConfidence === "string" && opp.userConfidence.trim() !== ""
    ? Math.round(parseFloat(opp.userConfidence))
    : null;
  const feedbackAdj = feedbackAdjustment(opp.userConfidence);
  const feedbackReasons: string[] = [];
  if (feedbackAdj >= 5) feedbackReasons.push("Matches your feedback preferences");
  else if (feedbackAdj <= -5) feedbackReasons.push("Down-ranked by your feedback");

  const reasons = [...feedbackReasons, ...baseReasons].slice(0, 4);

  const dateUnknown = tags.includes("date-unknown");
  const stale = tags.includes("stale") || cls.stale;
  const confidence: "high" | "medium" | "low" =
    opp.sourceConfidence === "high" || opp.sourceConfidence === "medium" || opp.sourceConfidence === "low"
      ? opp.sourceConfidence
      : score >= 75 ? "high" : score >= 50 ? "medium" : "low";

  return {
    score,
    reasons,
    category: cls.category,
    dateUnknown,
    stale,
    confidence,
    feedbackScore,
    feedbackAdj,
    semanticSimilarity: null as number | null,
    postedDate: dateUnknown ? null : opp.postedDate,
  };
}

function mapOpportunity(opp: any) {
  return {
    ...opp,
    awardAmount: opp.awardAmount ? parseFloat(opp.awardAmount) : undefined,
    estimatedValue: opp.estimatedValue ? parseFloat(opp.estimatedValue) : undefined,
    ceilingValue: opp.ceilingValue ? parseFloat(opp.ceilingValue) : undefined,
    floorValue: opp.floorValue ? parseFloat(opp.floorValue) : undefined,
    relevanceScore: opp.relevanceScore ? parseFloat(opp.relevanceScore) : undefined,
    tags: parseTags(opp.tags),
    relevance: buildRelevanceView(opp),
  };
}

router.get("/opportunities", async (req, res) => {
  try {
    const {
      search, status, type, naicsCode, agency, source,
      dateRange, freshOnly, view,
      page = "1", limit = "50",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, parseInt(limit) || 50);
    const offset = (pageNum - 1) * limitNum;

    const days = dateRange != null ? parseInt(dateRange) : NaN;
    const dateCutoff = Number.isFinite(days) && days > 0
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : null;
    const onlyFresh = freshOnly === "true" || freshOnly === "1";
    const viewMode: OpportunityViewMode = view === "needs-verification" || view === "closed" || view === "all" ? view : "actionable";
    const requestNow = new Date();

    // ── Build WHERE conditions ────────────────────────────────────────────────

    const conditions: ReturnType<typeof and>[] = [];

    // Free-text search across title, agency, description, solicitation number.
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(opportunitiesTable.title, term),
          ilike(opportunitiesTable.agency, term),
          ilike(opportunitiesTable.description, term),
          ilike(opportunitiesTable.solicitationNumber, term),
        )!,
      );
    }

    if (status && status !== "all") {
      conditions.push(eq(opportunitiesTable.status, status as "active" | "archived"));
    }

    if (type) {
      conditions.push(ilike(opportunitiesTable.type, `%${type}%`));
    }

    if (naicsCode) {
      conditions.push(eq(opportunitiesTable.naicsCode, naicsCode));
    }

    if (agency) {
      conditions.push(ilike(opportunitiesTable.agency, `%${agency}%`));
    }

    if (source) {
      // statePortals is a legacy alias for publicPortalProviders.
      if (source === "publicPortalProviders" || source === "statePortals") {
        conditions.push(
          or(
            ilike(opportunitiesTable.providerName, "publicPortalProviders"),
            ilike(opportunitiesTable.providerName, "statePortals"),
          )!,
        );
      } else {
        conditions.push(ilike(opportunitiesTable.providerName, source));
      }
    }

    if (dateCutoff) {
      conditions.push(sql`${opportunitiesTable.postedDate} >= ${dateCutoff}` as any);
    }

    // ── Quality filter pushed into SQL ────────────────────────────────────────
    //
    // shouldShowOpportunity() runs at write time (unifiedSearch) to block junk
    // before it enters the DB. The SQL conditions below enforce the same gate
    // at read time so that any legacy rows that predate the write-time filter
    // are also hidden without requiring a destructive purge.
    //
    // Rule 1: title must be >= 10 characters (catches untitled stubs).
    conditions.push(sql`length(${opportunitiesTable.title}) >= 10` as any);

    // Rule 2: The combined text (title + description + agency) must contain at
    // least one Occu-Med service signal.
    // Pattern: lower(concat) LIKE ANY(ARRAY['%signal1%','%signal2%',...])
    // Each pattern remains a bound parameter inside an explicit PostgreSQL
    // text[] so LIKE ANY receives the array type it requires.
    {
      const servicePatterns = OCCUMED_SERVICE_SIGNALS.map((s) => `%${s}%`);
      conditions.push(
        likeAnyText(sql`(
          lower(${opportunitiesTable.title}) || ' ' ||
          lower(coalesce(${opportunitiesTable.description}, '')) || ' ' ||
          lower(coalesce(${opportunitiesTable.agency}, ''))
        )`, servicePatterns) as any,
      );
    }

    // Rule 3: Hard-reject signals — none may appear in the combined text.
    // NOT (... LIKE ANY(ARRAY[...])) — same safe bound-array pattern.
    {
      const rejectPatterns = HARD_REJECT_SIGNALS.map((s) => `%${s}%`);
      conditions.push(
        notLikeAnyText(sql`(
          lower(${opportunitiesTable.title}) || ' ' ||
          lower(coalesce(${opportunitiesTable.description}, '')) || ' ' ||
          lower(coalesce(${opportunitiesTable.agency}, '')) || ' ' ||
          lower(coalesce(${opportunitiesTable.providerName}, '')) || ' ' ||
          lower(coalesce(${opportunitiesTable.samUrl}, ''))
        )`, rejectPatterns) as any,
      );
    }

    // Rule 4: Stale-year-only records.
    // hasStaleYearOnly() rejects records whose concatenated text mentions ONLY
    // years before the current year, with no current or near-future year present.
    // SQL equivalent: if the text contains any 20XX year at all, it must also
    // contain at least one year >= CURRENT_YEAR.
    //
    // Pattern: text ~ '\y20\d{2}\y' (has some year) AND
    //          text !~ '\y(CURRENT_YEAR|CURRENT_YEAR+1|CURRENT_YEAR+2)\y'
    // means stale-year-only → reject.
    // We express this as NOT (has_old_year AND NOT has_current_or_future_year).
    //
    // CURRENT_YEAR is evaluated once at module load; the literals are safe
    // integers injected into the sql template (no user input involved).
    {
      const wideText = sql`(
        coalesce(${opportunitiesTable.title}, '') || ' ' ||
        coalesce(${opportunitiesTable.description}, '') || ' ' ||
        coalesce(${opportunitiesTable.agency}, '') || ' ' ||
        coalesce(${opportunitiesTable.providerName}, '') || ' ' ||
        coalesce(${opportunitiesTable.solicitationNumber}, '') || ' ' ||
        coalesce(${opportunitiesTable.samUrl}, '')
      )`;
      // A record has a stale-year-only problem when:
      //   it mentions some past year  AND  it mentions NO current/future year.
      // We reject those by requiring: NOT (past_year_present AND NOT future_year_present).
      conditions.push(
        sql`NOT (
          ${wideText} ~ '\\m20[0-9]{2}\\M'
          AND NOT ${wideText} ~ ${`\\m(${CURRENT_YEAR}|${CURRENT_YEAR + 1}|${CURRENT_YEAR + 2})\\M`}
        )` as any,
      );
    }

    // Rule 5: Job-advertisement title signals (title-only check, mirrors the
    // JS JOB_TITLE_SIGNALS check in shouldShowOpportunity).
    // The normalised title is lower-cased and padded with a leading/trailing
    // space to match the original ` signal ` boundary logic.
    {
      const jobTitlePatterns = [" wanted", " needed", "apply ", "we are hiring", "position ", "vacancy"].map(
        (s) => `%${s}%`,
      );
      conditions.push(
        notLikeAnyText(
          sql`(' ' || lower(${opportunitiesTable.title}) || ' ')`,
          jobTitlePatterns,
        ) as any,
      );
    }

    // ── freshOnly: exclude stale/date-unknown rows ────────────────────────────
    // These flags are stored in the JSON tags column. A simple LIKE check is
    // sufficient since the tags field is controlled output ("stale", "date-unknown").
    if (onlyFresh) {
      conditions.push(
        and(
          sql`coalesce(${opportunitiesTable.tags}, '') NOT LIKE '%stale%'` as any,
          sql`coalesce(${opportunitiesTable.tags}, '') NOT LIKE '%date-unknown%'` as any,
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // ── Ranking expression ────────────────────────────────────────────────────
    //
    // Primary: COALESCE(relevance_score, 50) + feedback adjustment
    //   relevance_score is stored 0-100; 50 is the neutral fallback for legacy rows.
    //   feedback adjustment = ((user_confidence - 50) / 50) * FEEDBACK_RANK_WEIGHT
    //   clamped to [-FEEDBACK_RANK_WEIGHT, +FEEDBACK_RANK_WEIGHT], 0 when null.
    //
    // Secondary: date-unknown rows are pushed below clearly-dated rows at the
    //   same score (CASE ... THEN 0 ELSE 1 END DESC).
    //
    // Tertiary: posted_date DESC (most recent first).
    const feedbackWeight = FEEDBACK_RANK_WEIGHT; // 15
    const rankExpr = sql<number>`(
      COALESCE(${opportunitiesTable.relevanceScore}::numeric, 50) +
      LEAST(${boundNumeric(feedbackWeight)}, GREATEST(-(${boundNumeric(feedbackWeight)}),
        CASE
          WHEN ${opportunitiesTable.userConfidence} IS NOT NULL
          THEN ((${opportunitiesTable.userConfidence}::numeric - 50.0) / 50.0) * ${boundNumeric(feedbackWeight)}
          ELSE 0
        END
      ))
    )`;

    const dateKnownExpr = sql<number>`
      CASE WHEN coalesce(${opportunitiesTable.tags}, '') LIKE '%date-unknown%' THEN 0 ELSE 1 END
    `;

    // ── Accurate total count (same WHERE, no LIMIT) ───────────────────────────
    const [{ value: totalCount }] = await db
      .select({ value: countFn() })
      .from(opportunitiesTable)
      .where(where);

    // ── Paginated data query ──────────────────────────────────────────────────
    const rows = await db
      .select(opportunityListSelection(opportunitiesTable))
      .from(opportunitiesTable)
      .where(where)
      .orderBy(desc(rankExpr), desc(dateKnownExpr), desc(opportunitiesTable.postedDate))
      .limit(viewMode === "actionable" ? Math.max(1000, limitNum * 10) : limitNum)
      .offset(viewMode === "actionable" ? 0 : offset);

    const mappedRows = rows.map(mapOpportunity).map((opp) => ({
      ...opp,
      quality: classifyOpportunityQuality(opp, requestNow),
    }));
    const filteredRows = mappedRows
      .filter((opp) => qualityMatchesView(opp.quality, viewMode))
      .sort((a, b) => opportunityQualityRank(b, b.quality, requestNow) - opportunityQualityRank(a, a.quality, requestNow));
    let page_data = viewMode === "actionable" ? filteredRows.slice(offset, offset + limitNum) : filteredRows;

    // Optional semantic re-rank applied only to the returned page (not the full DB).
    // Falls back to the SQL order on any failure.
    if (isSemanticRerankEnabled() && page_data.length > 0) {
      try {
        const rankBase = (o: any) => o.relevance.score + (o.relevance.feedbackAdj ?? 0);
        const reranked = await semanticRerank(
          page_data.map((o) => ({
            item: o,
            baseScore: rankBase(o),
            text: `${o.title ?? ""}. ${o.description ?? ""}`.trim(),
          })),
        );
        page_data = reranked.map((r) => {
          if (r.similarity != null) r.item.relevance.semanticSimilarity = Math.round(r.similarity * 100);
          return r.item;
        });
      } catch (err) {
        req.log.error(err, "semantic rerank failed; using base ranking");
      }
    }

    return res.json({ data: page_data, total: viewMode === "actionable" ? filteredRows.length : Number(totalCount), page: pageNum, limit: limitNum, view: viewMode });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({
      error: "Failed to fetch opportunities",
      details: opportunityListErrorDetail(err),
    });
  }
});

router.post("/opportunities/fetch", createStartIngestionHandler(startManualIngestion));

router.get("/opportunities/ingestion-runs/current", async (req, res) => {
  try {
    return res.json({ run: await getCurrentIngestionRun() });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to read the current ingestion run" });
  }
});

router.get("/opportunities/ingestion-runs", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    return res.json({ runs: await listRecentIngestionRuns(Number.isFinite(limit) ? limit : 20) });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list ingestion runs" });
  }
});

router.get("/opportunities/ingestion-runs/:runId", async (req, res) => {
  try {
    const run = await getIngestionRun(req.params.runId);
    if (!run) return res.status(404).json({ error: "Ingestion run not found" });
    return res.json({ run });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to read ingestion run" });
  }
});

router.post("/opportunities/ingestion-runs/:runId/retry", async (req, res) => {
  try {
    const run = await retryFailedProviders(req.params.runId);
    return res.status(202).json({ runId: run.id, status: run.status, run });
  } catch (err: any) {
    req.log.error(err);
    if (err?.constructor?.name === "ActiveIngestionRunError") return res.status(409).json({ error: err.message, runId: err.runId });
    if (err instanceof IngestionRunNotRetryableError) return res.status(400).json({ error: err.message });
    if (String(err?.message).includes("not found")) return res.status(404).json({ error: err.message });
    return res.status(500).json({ error: "Failed to retry ingestion run" });
  }
});

router.post("/opportunities/reconcile-expired", async (req, res) => {
  try {
    return res.json({ archived: await reconcileExpiredOpportunities() });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Deadline reconciliation failed" });
  }
});

router.post("/opportunities/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const csvContent = req.file.buffer.toString("utf-8");
    const result = await importFromCsv(csvContent);
    return res.json(result);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to import CSV", details: err.message });
  }
});

// POST /opportunities/purge-junk — delete all DB records that fail the quality filter
// Run this once after deploy to clean up old junk already in the database.
router.post("/opportunities/purge-junk", async (req, res) => {
  try {
    const allRows = await db.select().from(opportunitiesTable).limit(5000);
    const toDelete = allRows.filter((opp) => !shouldShowOpportunity(opp));
    let deleted = 0;
    for (const opp of toDelete) {
      await db.delete(opportunitiesTable).where(eq(opportunitiesTable.id, opp.id));
      deleted++;
    }
    return res.json({
      ok: true,
      scanned: allRows.length,
      deleted,
      kept: allRows.length - deleted,
      message: `Purged ${deleted} junk records from the database.`,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Purge failed" });
  }
});

router.get("/opportunities/:id", async (req, res) => {
  try {
    const rows = await db.select().from(opportunitiesTable).where(eq(opportunitiesTable.id, req.params.id));
    if (rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
    return res.json(mapOpportunity(rows[0]));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get opportunity" });
  }
});

router.delete("/opportunities/:id", async (req, res) => {
  try {
    await db.delete(opportunitiesTable).where(eq(opportunitiesTable.id, req.params.id));
    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to delete opportunity" });
  }
});

function toDateString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  try {
    const d = typeof value === "string" ? new Date(value) : value;
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

function formatCurrency(value: number | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

function detectServiceLines(text: string): string[] {
  const t = text.toLowerCase();
  const lines: string[] = [];
  if (/(drug test|drug screen|alcohol test|substance abuse|dot drug)/.test(t)) lines.push("Drug & alcohol testing");
  if (/(dot physical|dot medical|dot exam|pre-employment physical|pre employment physical|medical exam|fitness for duty)/.test(t)) lines.push("Physical exams / fitness for duty");
  if (/(respirator fit|fit test|pft|spirometry|pulmonary function)/.test(t)) lines.push("Respiratory / PFT fit testing");
  if (/(audiogram|hearing conservation|hearing test)/.test(t)) lines.push("Hearing / audiograms");
  if (/(vaccine|titer|tb test|tuberculosis|flu shot|immunization)/.test(t)) lines.push("Vaccines / titers / TB testing");
  if (/(medical surveillance|osha|occupational health|occupational medicine)/.test(t)) lines.push("Occupational health / medical surveillance");
  if (lines.length === 0) lines.push("General occupational health");
  return lines;
}

function buildFallbackSummary(opp: any) {
  const text = `${opp.title ?? ""} ${opp.description ?? ""} ${opp.agency ?? ""} ${opp.notes ?? ""}`;
  const lines = detectServiceLines(text);
  const due = toDateString(opp.responseDeadline);
  const posted = toDateString(opp.postedDate);
  const value = formatCurrency(opp.estimatedValue ?? opp.awardAmount ?? opp.ceilingValue ?? opp.floorValue);
  const sourceUrl = opp.samUrl || opp.sourceUrl || opp.url || null;
  const buyer = opp.agency && opp.agency !== "Unknown" ? opp.agency : null;
  const summarySentences: string[] = [opp.title ?? "Opportunity details are limited."];
  if (opp.description) summarySentences.push(opp.description.slice(0, 220).replace(/\s+/g, " ").trim() + (opp.description.length > 220 ? "..." : ""));
  if (buyer) summarySentences.push(`Procuring agency: ${buyer}.`);
  if (due) summarySentences.push(`Response due ${due}.`);

  const fitReason = opp.relevance?.reasons?.length
    ? opp.relevance.reasons.slice(0, 2).join(" ")
    : `Mentions ${lines.slice(0, 2).join(" and ") || "occupational health"}.`;

  const missing: string[] = [];
  if (!due) missing.push("Response deadline");
  if (!value) missing.push("Estimated value");
  if (!buyer) missing.push("Procuring agency");
  if (!opp.description || opp.description.length < 60) missing.push("Full opportunity description");
  if (!sourceUrl) missing.push("Source link");

  return {
    summary: summarySentences.join(" "),
    occumedFit: `This appears to match Occu-Med based on ${fitReason}`,
    serviceLines: lines.slice(0, 3),
    keyDates: { posted, due },
    buyer,
    estimatedValue: value,
    bidNotes: ["Review source page to confirm scope and eligibility before bidding.", opp.relevance?.stale ? "Posted date may be stale; verify it is still open." : "Confirm deadline on the source page."].filter(Boolean),
    missingInfo: missing,
    sourceUrl,
    provider: "fallback" as const,
  };
}

function cleanJsonResponse(text: string): string {
  return text
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    .replace(/^\s*\{\s*/g, "{")
    .replace(/\s*\}\s*$/g, "}")
    .trim();
}

function buildSummaryPrompt(opp: any, extractedContent: string | null): string {
  const due = toDateString(opp.responseDeadline);
  const posted = toDateString(opp.postedDate);
  const value = formatCurrency(opp.estimatedValue ?? opp.awardAmount ?? opp.ceilingValue ?? opp.floorValue);
  const sourceUrl = opp.samUrl || opp.sourceUrl || opp.url || null;
  const buyer = opp.agency && opp.agency !== "Unknown" ? opp.agency : null;
  const score = opp.relevance?.score ?? opp.relevanceScore ?? null;
  const reasons = opp.relevance?.reasons?.join(" · ") ?? (typeof opp.notes === "string" ? opp.notes : "");

  return `You are an RFP analyst for Occu-Med, an occupational health and medical exam coordination company.

Occu-Med services include:
- occupational health exams
- pre-employment physicals
- DOT physicals
- drug and alcohol testing
- PFT/spirometry
- respirator fit testing
- audiograms
- vaccines/titers/TB testing
- deployment medical exams
- medical surveillance

Analyze the opportunity below and produce a concise procurement brief.

Rules:
- Be practical and business-focused.
- Do not hallucinate missing dates, values, or agencies.
- If the opportunity is likely irrelevant, say so clearly.
- Return ONLY valid JSON.

Required JSON:
{
  "summary": "2-4 sentence plain-English summary",
  "occumedFit": "why this may or may not fit Occu-Med",
  "serviceLines": ["..."],
  "keyDates": {
    "posted": "YYYY-MM-DD or null",
    "due": "YYYY-MM-DD or null"
  },
  "buyer": "agency/buyer or null",
  "estimatedValue": "value or null",
  "bidNotes": ["short practical note", "short practical note"],
  "missingInfo": ["missing item", "missing item"]
}

Opportunity:
Title: ${opp.title ?? "N/A"}
Agency: ${buyer ?? "N/A"}
Posted: ${posted ?? "N/A"}
Due: ${due ?? "N/A"}
Estimated Value: ${value ?? "N/A"}
Relevance Score: ${score ?? "N/A"}
Relevance Reasons: ${reasons || "N/A"}
Source URL: ${sourceUrl ?? "N/A"}
Description: ${(opp.description ?? "").slice(0, 2500).replace(/\s+/g, " ").trim() || "N/A"}
${extractedContent ? `Extracted Page Content:\n${extractedContent.slice(0, 4000).replace(/\s+/g, " ").trim()}` : ""}`;
}

async function completeWithProvider(prompt: string, provider: "groq" | "openrouter"): Promise<any> {
  const text = provider === "groq"
    ? await groqProvider.complete(prompt, 900)
    : await openrouterProvider.complete(prompt, 900);
  const cleaned = cleanJsonResponse(text);
  return JSON.parse(cleaned);
}

function sanitizeSummaryResult(raw: any, opp: any): any {
  const sourceUrl = opp.samUrl || opp.sourceUrl || opp.url || null;
  const fallback = buildFallbackSummary(opp);

  return {
    summary: typeof raw?.summary === "string" && raw.summary.trim() ? raw.summary : fallback.summary,
    occumedFit: typeof raw?.occumedFit === "string" && raw.occumedFit.trim() ? raw.occumedFit : fallback.occumedFit,
    serviceLines: Array.isArray(raw?.serviceLines) && raw.serviceLines.length > 0 ? raw.serviceLines.filter((s: any) => typeof s === "string").slice(0, 5) : fallback.serviceLines,
    keyDates: {
      posted: typeof raw?.keyDates?.posted === "string" ? raw.keyDates.posted || null : fallback.keyDates.posted,
      due: typeof raw?.keyDates?.due === "string" ? raw.keyDates.due || null : fallback.keyDates.due,
    },
    buyer: typeof raw?.buyer === "string" ? raw.buyer || null : fallback.buyer,
    estimatedValue: typeof raw?.estimatedValue === "string" ? raw.estimatedValue || null : fallback.estimatedValue,
    bidNotes: Array.isArray(raw?.bidNotes) && raw.bidNotes.length > 0 ? raw.bidNotes.filter((s: any) => typeof s === "string").slice(0, 5) : fallback.bidNotes,
    missingInfo: Array.isArray(raw?.missingInfo) && raw.missingInfo.length > 0 ? raw.missingInfo.filter((s: any) => typeof s === "string").slice(0, 5) : fallback.missingInfo,
    sourceUrl,
    provider: raw?.provider ?? "fallback",
  };
}

router.post("/opportunities/:id/summary", async (req, res) => {
  try {
    const rows = await db.select().from(opportunitiesTable).where(eq(opportunitiesTable.id, req.params.id));
    if (rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });

    const opp = mapOpportunity(rows[0]);
    const sourceUrl = opp.samUrl || opp.sourceUrl || opp.url || null;
    let extractedContent: string | null = null;

    if (sourceUrl) {
      try {
        const isTavilyAvailable = await tavilyProvider.isConfigured();
        if (isTavilyAvailable) {
          const extracted = await tavilyProvider.extractContent([sourceUrl]);
          if (extracted.length > 0) extractedContent = extracted[0].rawContent;
        }
      } catch (err) {
        req.log.warn(err, "Tavily extract failed for summary");
      }
    }

    const prompt = buildSummaryPrompt(opp, extractedContent);
    let result: any = null;
    let provider: "groq" | "openrouter" | "fallback" = "fallback";

    try {
      const isGroqConfigured = await groqProvider.isConfigured();
      if (isGroqConfigured) {
        result = await completeWithProvider(prompt, "groq");
        provider = "groq";
      }
    } catch (err) {
      req.log.warn(err, "Groq summary failed");
    }

    if (!result) {
      try {
        const isOpenRouterConfigured = await openrouterProvider.isConfigured();
        if (isOpenRouterConfigured) {
          result = await completeWithProvider(prompt, "openrouter");
          provider = "openrouter";
        }
      } catch (err) {
        req.log.warn(err, "OpenRouter summary failed");
      }
    }

    if (!result) {
      return res.json(buildFallbackSummary(opp));
    }

    return res.json(sanitizeSummaryResult({ ...result, provider }, opp));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to generate summary" });
  }
});

router.post("/opportunities/enrich", async (req, res) => {
  const BATCH_SIZE = 5;
  const MAX_RECORDS = 100;
  const stats = { enriched: 0, agencyUpdated: 0, deadlineUpdated: 0, valueUpdated: 0, errors: [] as string[] };

  try {
    const records = await db
      .select({
        id: opportunitiesTable.id,
        title: opportunitiesTable.title,
        description: opportunitiesTable.description,
        agency: opportunitiesTable.agency,
        samUrl: opportunitiesTable.samUrl,
        responseDeadline: opportunitiesTable.responseDeadline,
        estimatedValue: opportunitiesTable.estimatedValue,
      })
      .from(opportunitiesTable)
      .where(
        or(
          isNull(opportunitiesTable.responseDeadline),
          isNull(opportunitiesTable.estimatedValue),
          eq(opportunitiesTable.agency, "Unknown")
        )
      )
      .limit(MAX_RECORDS);

    for (const rec of records) {
      const { agencyHint } = extractMetadataFromText(rec.description ?? "", rec.title);
      if (agencyHint && rec.agency === "Unknown") {
        await db.update(opportunitiesTable).set({ agency: agencyHint, updatedAt: new Date() }).where(eq(opportunitiesTable.id, rec.id));
        stats.agencyUpdated++;
      }
    }

    const needsEnrich = records.filter((r) => r.samUrl && (!r.responseDeadline || !r.estimatedValue));
    const isTavilyAvailable = await tavilyProvider.isConfigured();
    if (!isTavilyAvailable) {
      stats.errors.push("Tavily not configured — date/value enrichment skipped");
    } else {
      for (let i = 0; i < needsEnrich.length; i += BATCH_SIZE) {
        const batch = needsEnrich.slice(i, i + BATCH_SIZE);
        const urls = batch.map((r) => r.samUrl!);
        let extracted: { url: string; rawContent: string }[] = [];
        try {
          extracted = await tavilyProvider.extractContent(urls);
        } catch (err: any) {
          stats.errors.push(`Tavily batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
          continue;
        }

        for (const result of extracted) {
          const rec = batch.find((r) => r.samUrl === result.url);
          if (!rec) continue;
          const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(result.rawContent.slice(0, 4000), rec.title);
          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (!rec.responseDeadline && deadline) {
            updates.responseDeadline = deadline;
            stats.deadlineUpdated++;
            if (deadline < new Date()) updates.status = "archived";
          }
          if (!rec.estimatedValue && estimatedValue != null) {
            updates.estimatedValue = String(estimatedValue);
            stats.valueUpdated++;
          }
          if (rec.agency === "Unknown" && agencyHint) updates.agency = agencyHint;

          if (Object.keys(updates).length > 1) {
            await db.update(opportunitiesTable).set(updates).where(eq(opportunitiesTable.id, rec.id));
            stats.enriched++;
          }
        }

        if (i + BATCH_SIZE < needsEnrich.length) await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    return res.json({
      enriched: stats.enriched,
      agencyUpdated: stats.agencyUpdated,
      deadlineUpdated: stats.deadlineUpdated,
      valueUpdated: stats.valueUpdated,
      processed: records.length,
      errors: stats.errors,
    });
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Enrichment failed", details: err.message });
  }
});

export default router;
