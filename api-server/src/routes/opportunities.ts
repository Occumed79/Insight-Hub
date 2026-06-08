import { Router } from "express";
import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq, ilike, and, or, sql, isNull, lt } from "drizzle-orm";
import { unifiedFetch } from "../lib/search/unifiedSearch";
import { importFromCsv } from "../lib/csv-service";
import { tavilyProvider } from "../lib/providers/tavily";
import { extractMetadataFromText } from "../lib/search/heuristicExtract";
import { classifyResult } from "../lib/search/relevance";
import { semanticRerank, isSemanticRerankEnabled } from "../lib/search/semanticRerank";
import multer from "multer";

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

// Exported so unifiedSearch can use it at write time (prevents junk from ever entering DB)
export { shouldShowOpportunity };

async function archiveExpiredOpportunities(): Promise<void> {
  try {
    await db
      .update(opportunitiesTable)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(opportunitiesTable.status, "active"),
          lt(opportunitiesTable.responseDeadline, new Date())
        )
      );
  } catch {
    // Non-critical — don't fail the request if this errors
  }
}

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
    await archiveExpiredOpportunities();

    const { search, status, type, naicsCode, agency, source, dateRange, freshOnly, page = "1", limit = "50" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, parseInt(limit) || 50);
    const offset = (pageNum - 1) * limitNum;

    // Date window: how many days back to consider "current". Reaches the DB-level
    // postedDate filter so the frontend date control actually constrains results.
    const days = dateRange != null ? parseInt(dateRange) : NaN;
    const dateCutoff = Number.isFinite(days) && days > 0
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : null;
    const onlyFresh = freshOnly === "true" || freshOnly === "1";

    const conditions: any[] = [];

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(opportunitiesTable.title, term),
          ilike(opportunitiesTable.agency, term),
          ilike(opportunitiesTable.description, term),
          ilike(opportunitiesTable.solicitationNumber, term)
        )
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
      conditions.push(ilike(opportunitiesTable.providerName, source));
    }

    if (dateCutoff) {
      conditions.push(sql`${opportunitiesTable.postedDate} >= ${dateCutoff}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Pull a larger window, quality-filter it in the API, then paginate the clean set.
    // This immediately hides bad historical records already saved in Neon without requiring manual cleanup.
    const rawRows = await db
      .select()
      .from(opportunitiesTable)
      .where(where)
      .limit(1000)
      .orderBy(sql`${opportunitiesTable.postedDate} desc`);

    let mappedAll = rawRows.filter(shouldShowOpportunity).map(mapOpportunity);

    // Drop results flagged stale / date-unknown when the caller wants only fresh.
    if (onlyFresh) {
      mappedAll = mappedAll.filter((o) => !o.relevance.stale && !o.relevance.dateUnknown);
    }

    // Rank by transparent relevance score blended with the feedback-learned
    // signal, then by recency. Records with an unknown date never sort above
    // clearly-dated ones at the same score. feedbackAdj is 0 when no grades exist,
    // so ranking is unchanged until the user starts grading results.
    const rankBase = (o: any) => o.relevance.score + (o.relevance.feedbackAdj ?? 0);
    mappedAll.sort((a, b) => {
      const diff = rankBase(b) - rankBase(a);
      if (diff !== 0) return diff;
      const at = a.relevance.dateUnknown ? 0 : new Date(a.postedDate).getTime();
      const bt = b.relevance.dateUnknown ? 0 : new Date(b.postedDate).getTime();
      return bt - at;
    });

    // Optional semantic re-rank of the top slice by embedding similarity to an
    // ideal Occu-Med profile (opt-in via ENABLE_SEMANTIC_RERANK + Jina key).
    // Falls back to the order above on any failure.
    if (isSemanticRerankEnabled() && mappedAll.length > 0) {
      try {
        const reranked = await semanticRerank(
          mappedAll.map((o) => ({
            item: o,
            baseScore: rankBase(o),
            text: `${o.title ?? ""}. ${o.description ?? ""}`.trim(),
          }))
        );
        mappedAll = reranked.map((r) => {
          if (r.similarity != null) r.item.relevance.semanticSimilarity = Math.round(r.similarity * 100);
          return r.item;
        });
      } catch (err) {
        req.log.error(err, "semantic rerank failed; using base ranking");
      }
    }

    const data = mappedAll.slice(offset, offset + limitNum);

    return res.json({ data, total: mappedAll.length, page: pageNum, limit: limitNum });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to fetch opportunities" });
  }
});

router.post("/opportunities/fetch", async (req, res) => {
  try {
    const { keywords, dateRange, providers } = req.body as {
      keywords?: string;
      dateRange?: number;
      providers?: string[];
    };

    const providerNameMap: Record<string, string> = {
      sam_gov: "samGov",
      grantsGov: "grantsGov",
      grants_gov: "grantsGov",
      usaSpending: "usaSpending",
      usa_spending: "usaSpending",
      gemini: "gemini",
      serper: "serper",
      tavily: "tavily",
      tango: "tango",
      bidnet: "bidnet",
      exa: "exa",
      jina: "jina",
      firecrawl: "firecrawl",
      groq: "groq",
      openrouter: "openrouter",
      minimax: "minimax",
      statePortals: "statePortals",
      olostep: "olostep",
      browseAi: "browseAi",
      browserUse: "browserUse",
      clod: "clod",
      cloudflareWorker: "cloudflareWorker",
      cerebras: "cerebras",
      deepseek: "deepseek",
      mistral: "mistral",
      nvidia: "nvidia",
      you: "you",
      langsearch: "langsearch",
      websearch: "websearch",
      federalRegister: "federalRegister",
    };

    const resolvedProviders = providers && providers.length > 0
      ? providers.map((p) => providerNameMap[p] || p)
      : ["samGov"];

    const result = await unifiedFetch({
      keywords,
      dateRange,
      providers: resolvedProviders as any,
    });

    await archiveExpiredOpportunities();

    const allErrors = (result.providerResults ?? []).flatMap((pr: any) => (pr.errors ?? []).map((e: string) => `[${pr.provider}] ${e}`));

    return res.json({
      fetched: result.fetched,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      providers: result.providerResults?.map((pr: any) => ({
        name: pr.provider,
        fetched: pr.fetched,
        errors: pr.errors ?? [],
      })),
      diagnostics: allErrors.length > 0 ? allErrors : undefined,
    });
  } catch (err: any) {
    req.log.error(err);
    const msg: string = err?.message ?? String(err);
    if (msg === "SAM_API_KEY_NOT_CONFIGURED" || msg.includes("SAM_API_KEY_NOT_CONFIGURED")) {
      return res.status(400).json({ error: "SAM.gov API key not configured. Add it in Settings → Integrations." });
    }
    if (msg.includes("quota") || msg.includes("throttled") || msg.includes("rate limit")) {
      return res.status(429).json({ error: msg });
    }
    if (msg.includes("API key not configured") || msg.includes("not configured")) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({
      error: "Fetch failed: " + (msg.slice(0, 300) || "Unknown error"),
      details: msg,
    });
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
