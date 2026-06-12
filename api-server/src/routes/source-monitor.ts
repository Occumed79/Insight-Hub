/**
 * Source Monitor API Routes
 *
 * Endpoints:
 *   GET  /api/source-monitor/sources          — list all curated sources
 *   GET  /api/source-monitor/items             — list scraped items (with filters)
 *   POST /api/source-monitor/refresh           — refresh a single source
 *   POST /api/source-monitor/refresh-all       — refresh all enabled sources
 */

import { Router } from "express";
import { createHash } from "crypto";
import { eq, and, desc, sql, like, count as countFn } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  sourceMonitorItemsTable,
  sourceMonitorRunsTable,
} from "@workspace/db/schema";
import {
  MONITORED_SOURCES,
  getSourceById,
  getEnabledSources,
  isValidSourceId,
} from "../lib/source-monitor/registry";
import { scrapeSource } from "../lib/source-monitor/scraper";
import { logger } from "../lib/logger";

const router = Router();

// Rate limit tracking for refresh-all
const lastRefreshAll = new Map<string, number>();
const REFRESH_ALL_COOLDOWN_MS = 60_000; // 1 minute between refresh-all calls

function makeRunId(sourceId: string, timestamp: Date): string {
  const hash = createHash("sha256")
    .update(`${sourceId}::${timestamp.toISOString()}`)
    .digest("hex");
  return `smr-${hash.slice(0, 16)}`;
}

function makeItemId(sourceId: string, title: string, itemUrl?: string): string {
  const hash = createHash("sha256")
    .update(`${sourceId}::${title}::${itemUrl ?? ""}`)
    .digest("hex");
  return `smi-${hash.slice(0, 16)}`;
}

// ── GET /api/source-monitor/sources ──────────────────────────────────────────

router.get("/api/source-monitor/sources", async (_req, res) => {
  try {
    // Attach latest run info to each source
    const runs = await db
      .select()
      .from(sourceMonitorRunsTable)
      .orderBy(desc(sourceMonitorRunsTable.startedAt));

    const latestRunBySource = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!latestRunBySource.has(run.sourceId)) {
        latestRunBySource.set(run.sourceId, run);
      }
    }

    const sources = MONITORED_SOURCES.map((s) => {
      const run = latestRunBySource.get(s.id);
      return {
        ...s,
        lastRun: run
          ? {
              status: run.status,
              itemsFound: run.itemsFound,
              startedAt: run.startedAt,
              completedAt: run.completedAt,
            }
          : null,
      };
    });

    return res.json({ sources });
  } catch (err: any) {
    logger.error({ err }, "Failed to list source monitor sources");
    return res.status(500).json({ error: "Failed to list sources" });
  }
});

// ── GET /api/source-monitor/items ──────────────────────────────────────────

router.get("/api/source-monitor/items", async (req, res) => {
  const {
    category,
    source: sourceId,
    q,
    status,
    page: pageStr = "1",
    limit: limitStr = "50",
  } = req.query as Record<string, string>;

  const page = Math.max(1, parseInt(pageStr, 10));
  const limit = Math.min(200, Math.max(1, parseInt(limitStr, 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions: any[] = [];
    if (category) conditions.push(eq(sourceMonitorItemsTable.category, category));
    if (sourceId) conditions.push(eq(sourceMonitorItemsTable.sourceId, sourceId));
    if (status) conditions.push(eq(sourceMonitorItemsTable.scrapeStatus, status as any));
    if (q?.trim()) {
      conditions.push(like(sourceMonitorItemsTable.title, `%${q.trim()}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(sourceMonitorItemsTable)
        .where(where)
        .orderBy(desc(sourceMonitorItemsTable.scrapedAt), desc(sourceMonitorItemsTable.publishedDate))
        .limit(limit)
        .offset(offset),
      db.select({ count: countFn() }).from(sourceMonitorItemsTable).where(where),
    ]);

    const total = Number(totalRows[0]?.count ?? 0);
    return res.json({
      items: rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to list source monitor items");
    return res.status(500).json({ error: "Failed to list items" });
  }
});

// ── POST /api/source-monitor/refresh ─────────────────────────────────────────

router.post("/api/source-monitor/refresh", async (req, res) => {
  const { sourceId } = req.body as { sourceId?: string };

  if (!sourceId || !isValidSourceId(sourceId)) {
    return res.status(400).json({ error: "Invalid or missing sourceId" });
  }

  const source = getSourceById(sourceId)!;
  const now = new Date();
  const runId = makeRunId(sourceId, now);

  // Create run record
  await db.insert(sourceMonitorRunsTable).values({
    id: runId,
    sourceId,
    status: "success",
    itemsFound: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    startedAt: now,
  });

  try {
    const result = await scrapeSource(source);
    const completedAt = new Date();

    if (result.status !== "success" && result.status !== "no_items_found") {
      // Failed / blocked / timeout
      await db
        .update(sourceMonitorRunsTable)
        .set({
          status: result.status,
          errorMessage: result.errorMessage,
          completedAt,
        })
        .where(eq(sourceMonitorRunsTable.id, runId));

      return res.json({
        sourceId,
        status: result.status,
        errorMessage: result.errorMessage,
        itemsFound: 0,
      });
    }

    // Upsert items
    let created = 0;
    let updated = 0;
    for (const item of result.items) {
      const itemId = makeItemId(sourceId, item.title, item.itemUrl);
      const existing = await db
        .select({ id: sourceMonitorItemsTable.id })
        .from(sourceMonitorItemsTable)
        .where(eq(sourceMonitorItemsTable.id, itemId))
        .limit(1);

      const values = {
        id: itemId,
        sourceId,
        sourceName: source.name,
        category: source.category,
        title: item.title,
        summary: item.summary ?? null,
        itemUrl: item.itemUrl ?? null,
        sourceUrl: source.url,
        publishedDate: item.publishedDate ?? null,
        scrapeStatus: result.status as any,
        errorMessage: null,
        rawJson: JSON.stringify(item),
        scrapedAt: now,
        updatedAt: now,
      };

      if (existing.length > 0) {
        await db
          .update(sourceMonitorItemsTable)
          .set(values)
          .where(eq(sourceMonitorItemsTable.id, itemId));
        updated++;
      } else {
        await db.insert(sourceMonitorItemsTable).values({
          ...values,
          createdAt: now,
        });
        created++;
      }
    }

    await db
      .update(sourceMonitorRunsTable)
      .set({
        status: result.status,
        itemsFound: result.items.length,
        itemsCreated: created,
        itemsUpdated: updated,
        completedAt,
      })
      .where(eq(sourceMonitorRunsTable.id, runId));

    return res.json({
      sourceId,
      status: result.status,
      itemsFound: result.items.length,
      itemsCreated: created,
      itemsUpdated: updated,
    });
  } catch (err: any) {
    const completedAt = new Date();
    await db
      .update(sourceMonitorRunsTable)
      .set({
        status: "failed",
        errorMessage: err?.message ?? String(err),
        completedAt,
      })
      .where(eq(sourceMonitorRunsTable.id, runId));

    logger.error({ err, sourceId }, "Source monitor refresh failed");
    return res.status(500).json({
      sourceId,
      status: "failed",
      errorMessage: err?.message ?? String(err),
    });
  }
});

// ── POST /api/source-monitor/refresh-all ─────────────────────────────────────

router.post("/api/source-monitor/refresh-all", async (req, res) => {
  const clientIp = (req.ip ?? "unknown") as string;
  const now = Date.now();
  const last = lastRefreshAll.get(clientIp) ?? 0;

  if (now - last < REFRESH_ALL_COOLDOWN_MS) {
    return res.status(429).json({
      error: `Rate limited — wait ${Math.ceil((REFRESH_ALL_COOLDOWN_MS - (now - last)) / 1000)}s before another refresh-all`,
    });
  }
  lastRefreshAll.set(clientIp, now);

  const sources = getEnabledSources();
  const results: Array<{
    sourceId: string;
    status: string;
    itemsFound: number;
    errorMessage?: string;
  }> = [];

  // Run sequentially with a small delay to be polite to target servers
  for (const source of sources) {
    const startTime = Date.now();
    const runId = makeRunId(source.id, new Date(startTime));

    await db.insert(sourceMonitorRunsTable).values({
      id: runId,
      sourceId: source.id,
      status: "success",
      itemsFound: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      startedAt: new Date(startTime),
    });

    try {
      const result = await scrapeSource(source);
      const completedAt = new Date();

      if (result.status !== "success" && result.status !== "no_items_found") {
        await db
          .update(sourceMonitorRunsTable)
          .set({
            status: result.status,
            errorMessage: result.errorMessage,
            completedAt,
          })
          .where(eq(sourceMonitorRunsTable.id, runId));

        results.push({
          sourceId: source.id,
          status: result.status,
          itemsFound: 0,
          errorMessage: result.errorMessage,
        });
        continue;
      }

      let created = 0;
      let updated = 0;
      for (const item of result.items) {
        const itemId = makeItemId(source.id, item.title, item.itemUrl);
        const existing = await db
          .select({ id: sourceMonitorItemsTable.id })
          .from(sourceMonitorItemsTable)
          .where(eq(sourceMonitorItemsTable.id, itemId))
          .limit(1);

        const values = {
          id: itemId,
          sourceId: source.id,
          sourceName: source.name,
          category: source.category,
          title: item.title,
          summary: item.summary ?? null,
          itemUrl: item.itemUrl ?? null,
          sourceUrl: source.url,
          publishedDate: item.publishedDate ?? null,
          scrapeStatus: result.status as any,
          errorMessage: null,
          rawJson: JSON.stringify(item),
          scrapedAt: new Date(startTime),
          updatedAt: new Date(startTime),
        };

        if (existing.length > 0) {
          await db
            .update(sourceMonitorItemsTable)
            .set(values)
            .where(eq(sourceMonitorItemsTable.id, itemId));
          updated++;
        } else {
          await db.insert(sourceMonitorItemsTable).values({
            ...values,
            createdAt: new Date(startTime),
          });
          created++;
        }
      }

      await db
        .update(sourceMonitorRunsTable)
        .set({
          status: result.status,
          itemsFound: result.items.length,
          itemsCreated: created,
          itemsUpdated: updated,
          completedAt,
        })
        .where(eq(sourceMonitorRunsTable.id, runId));

      results.push({
        sourceId: source.id,
        status: result.status,
        itemsFound: result.items.length,
      });
    } catch (err: any) {
      const completedAt = new Date();
      await db
        .update(sourceMonitorRunsTable)
        .set({
          status: "failed",
          errorMessage: err?.message ?? String(err),
          completedAt,
        })
        .where(eq(sourceMonitorRunsTable.id, runId));

      results.push({
        sourceId: source.id,
        status: "failed",
        itemsFound: 0,
        errorMessage: err?.message ?? String(err),
      });
    }

    // Small politeness delay between sources
    await new Promise((r) => setTimeout(r, 500));
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const blockedCount = results.filter((r) => r.status === "blocked").length;
  const failedCount = results.filter((r) => r.status === "failed" || r.status === "timeout").length;
  const noItemsCount = results.filter((r) => r.status === "no_items_found").length;
  const totalItems = results.reduce((sum, r) => sum + r.itemsFound, 0);

  return res.json({
    totalSources: sources.length,
    success: successCount,
    blocked: blockedCount,
    failed: failedCount,
    noItems: noItemsCount,
    totalItemsFound: totalItems,
    results,
  });
});

export default router;
