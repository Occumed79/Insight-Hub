import { Router } from "express";
import { db } from "@workspace/db";
import { opportunitiesTable } from "@workspace/db/schema";
import { eq, ilike, and, or, sql, isNull, lt } from "drizzle-orm";

/**
 * Auto-archive any "active" opportunities whose response deadline has passed.
 * Runs silently before list/fetch responses so stale data is never shown.
 */
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
import { unifiedFetch } from "../lib/search/unifiedSearch";
import { importFromCsv } from "../lib/csv-service";
import { tavilyProvider } from "../lib/providers/tavily";
import { extractMetadataFromText } from "../lib/search/heuristicExtract";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/opportunities", async (req, res) => {
  try {
    // Silently archive anything whose deadline has already passed before returning results
    await archiveExpiredOpportunities();

    const { search, status, type, naicsCode, agency, source, page = "1", limit = "50" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, parseInt(limit) || 50);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];

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

    // Filter by provider name (source column)
    if (source) {
      conditions.push(ilike(opportunitiesTable.providerName, source));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
      db.select().from(opportunitiesTable).where(where).limit(limitNum).offset(offset).orderBy(sql`${opportunitiesTable.postedDate} desc`),
      db.select({ count: sql<number>`count(*)` }).from(opportunitiesTable).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const mapped = data.map((opp) => ({
      ...opp,
      awardAmount: opp.awardAmount ? parseFloat(opp.awardAmount) : undefined,
      estimatedValue: opp.estimatedValue ? parseFloat(opp.estimatedValue) : undefined,
      ceilingValue: opp.ceilingValue ? parseFloat(opp.ceilingValue) : undefined,
      floorValue: opp.floorValue ? parseFloat(opp.floorValue) : undefined,
      relevanceScore: opp.relevanceScore ? parseFloat(opp.relevanceScore) : undefined,
    }));

    return res.json({ data: mapped, total, page: pageNum, limit: limitNum });
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

    // Map provider names from API format to internal ProviderName format
    const providerNameMap: Record<string, string> = {
      sam_gov: "samGov",
      gemini: "gemini",
      serper: "serper",
      tavily: "tavily",
      tango: "tango",
      bidnet: "bidnet",
    };

    let resolvedProviders: string[];
    if (providers && providers.length > 0) {
      resolvedProviders = providers.map((p) => providerNameMap[p] || p);
    } else {
      // Default: try all direct-source providers
      resolvedProviders = ["samGov"];
    }

    const result = await unifiedFetch({
      keywords,
      dateRange,
      providers: resolvedProviders as any,
    });

    // Immediately archive anything that slipped through with a past deadline
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
    if (err.message === "SAM_API_KEY_NOT_CONFIGURED") {
      return res.status(400).json({ error: "No data sources are configured. Please add API keys in Integrations." });
    } else {
      req.log.error(err);
      return res.status(500).json({ error: "Failed to fetch from data sources", details: err.message });
    }
  }
});

router.post("/opportunities/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
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
    if (rows.length === 0) {
      return res.status(404).json({ error: "Opportunity not found" });
    }
    const opp = rows[0];
    return res.json({
      ...opp,
      awardAmount: opp.awardAmount ? parseFloat(opp.awardAmount) : undefined,
      estimatedValue: opp.estimatedValue ? parseFloat(opp.estimatedValue) : undefined,
      ceilingValue: opp.ceilingValue ? parseFloat(opp.ceilingValue) : undefined,
      floorValue: opp.floorValue ? parseFloat(opp.floorValue) : undefined,
      relevanceScore: opp.relevanceScore ? parseFloat(opp.relevanceScore) : undefined,
    });
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

/**
 * POST /opportunities/enrich
 * Backfill missing Agency, Due Date, and Value fields on existing records.
 *
 * Strategy:
 *  1. Agency — apply heuristic extractor to title + description immediately (free).
 *  2. Deadline + Value — fetch full page content via Tavily Extract for records
 *     that have a URL, then run heuristic extraction on the richer text.
 *
 * Returns { enriched, agencyUpdated, deadlineUpdated, valueUpdated, errors }
 */
router.post("/opportunities/enrich", async (req, res) => {
  const BATCH_SIZE = 5;
  const MAX_RECORDS = 100;

  const stats = { enriched: 0, agencyUpdated: 0, deadlineUpdated: 0, valueUpdated: 0, errors: [] as string[] };

  try {
    // ── 1. Load all records missing any enriched field ────────────────────────
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

    // ── 2. Agency backfill from title + description (no API needed) ───────────
    for (const rec of records) {
      const { agencyHint } = extractMetadataFromText(rec.description ?? "", rec.title);
      if (agencyHint && rec.agency === "Unknown") {
        await db
          .update(opportunitiesTable)
          .set({ agency: agencyHint, updatedAt: new Date() })
          .where(eq(opportunitiesTable.id, rec.id));
        stats.agencyUpdated++;
      }
    }

    // ── 3. Deadline + Value via Tavily Extract ────────────────────────────────
    const needsEnrich = records.filter(
      (r) => r.samUrl && (!r.responseDeadline || !r.estimatedValue)
    );

    const isTavilyAvailable = await tavilyProvider.isConfigured();
    if (!isTavilyAvailable) {
      stats.errors.push("Tavily not configured — date/value enrichment skipped");
    } else {
      // Process in batches of BATCH_SIZE
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

          const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(
            result.rawContent.slice(0, 4000),
            rec.title
          );

          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (!rec.responseDeadline && deadline) {
            updates.responseDeadline = deadline;
            stats.deadlineUpdated++;
            // Auto-archive if the found deadline is already past
            if (deadline < new Date()) {
              updates.status = "archived";
            }
          }
          if (!rec.estimatedValue && estimatedValue != null) {
            updates.estimatedValue = String(estimatedValue);
            stats.valueUpdated++;
          }
          if (rec.agency === "Unknown" && agencyHint) {
            updates.agency = agencyHint;
          }

          if (Object.keys(updates).length > 1) {
            await db
              .update(opportunitiesTable)
              .set(updates)
              .where(eq(opportunitiesTable.id, rec.id));
            stats.enriched++;
          }
        }

        // Small delay between batches
        if (i + BATCH_SIZE < needsEnrich.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
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
