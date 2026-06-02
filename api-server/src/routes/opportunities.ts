import { Router } from "express";
import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq, ilike, and, or, sql, isNull, lt } from "drizzle-orm";
import { unifiedFetch } from "../lib/search/unifiedSearch";
import { importFromCsv } from "../lib/csv-service";
import { tavilyProvider } from "../lib/providers/tavily";
import { extractMetadataFromText } from "../lib/search/heuristicExtract";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

const HARD_REJECT_SIGNALS = [
  "ambulance",
  "emergency medical services",
  " ems ",
  "paramedic",
  "emt ",
  "lvn",
  "lpn",
  "registered nurse",
  " rn ",
  "nursing services",
  "nurse staffing",
  "medical staffing",
  "staff augmentation",
  "temporary staffing",
  "needed",
  "job posting",
  "job opening",
  "career opportunity",
  "now hiring",
  "hiring",
  "blanket purchase agreement",
  "regional medical consultant",
  "medical consultant",
  "disability adjudication",
  "social security disability",
  "pharmacy",
  "pharmaceutical",
  "marijuana",
  "cannabis",
  "phlebotomist",
  "perfusion",
  "ray tech",
  "x-ray tech",
  "radiology technologist",
  "dental assistant",
  "mental health therapy",
  "behavioral health treatment",
  "substance abuse treatment",
  "health insurance",
  "health benefits",
  "claims administration",
  "claims data",
  "medical claims",
  "childrens mental health",
  "children's mental health",
  "seaborn",
  "contract awarded",
  "award notice",
  "awarded to",
  "selected vendor",
  "notice of award",
  "bid tabulation",
];

const OCCUMED_SERVICE_SIGNALS = [
  "occupational health",
  "occupational medicine",
  "drug testing",
  "drug screening",
  "dot physical",
  "dot examination",
  "pre-employment physical",
  "pre employment physical",
  "employee health services",
  "medical surveillance",
  "fit for duty",
  "fitness for duty",
  "substance abuse testing",
  "random drug testing",
  "medical examination services",
  "medical screening",
  "respirator fit",
  "pulmonary function",
  "audiogram",
  "hearing test",
  "vaccination",
  "immunization",
  "titer",
  "tb test",
  "tuberculosis testing",
  "deployment medical",
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

  if (hasStaleYearOnly(raw)) return false;
  if (hasSignal(text, HARD_REJECT_SIGNALS)) return false;

  // For active opportunity review, only show items that clearly match Occu-Med service lines.
  // This prevents generic healthcare, ambulance, staffing, pharmacy, claims, and disability-consultant noise.
  return hasSignal(text, OCCUMED_SERVICE_SIGNALS);
}

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

function mapOpportunity(opp: any) {
  return {
    ...opp,
    awardAmount: opp.awardAmount ? parseFloat(opp.awardAmount) : undefined,
    estimatedValue: opp.estimatedValue ? parseFloat(opp.estimatedValue) : undefined,
    ceilingValue: opp.ceilingValue ? parseFloat(opp.ceilingValue) : undefined,
    floorValue: opp.floorValue ? parseFloat(opp.floorValue) : undefined,
    relevanceScore: opp.relevanceScore ? parseFloat(opp.relevanceScore) : undefined,
  };
}

router.get("/opportunities", async (req, res) => {
  try {
    await archiveExpiredOpportunities();

    const { search, status, type, naicsCode, agency, source, page = "1", limit = "50" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, parseInt(limit) || 50);
    const offset = (pageNum - 1) * limitNum;

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

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Pull a larger window, quality-filter it in the API, then paginate the clean set.
    // This immediately hides bad historical records already saved in Neon without requiring manual cleanup.
    const rawRows = await db
      .select()
      .from(opportunitiesTable)
      .where(where)
      .limit(1000)
      .orderBy(sql`${opportunitiesTable.postedDate} desc`);

    const filteredRows = rawRows.filter(shouldShowOpportunity);
    const data = filteredRows.slice(offset, offset + limitNum);
    const mapped = data.map(mapOpportunity);

    return res.json({ data: mapped, total: filteredRows.length, page: pageNum, limit: limitNum });
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
      you: "you",
      langsearch: "langsearch",
      websearch: "websearch",
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
