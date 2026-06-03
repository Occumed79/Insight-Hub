/**
 * Intelligence Feed Routes
 *
 * Stable recovery version. Provides list, feedback, signals, and fetch endpoints
 * without duplicate helper declarations.
 */

import { Router } from "express";
import { createHash } from "crypto";
import { eq, and, desc, sql, count as countFn } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  intelFeedItemsTable,
  intelFeedSignalsTable,
  type IntelSignalType,
  type IntelSource,
} from "@workspace/db/schema";

const router = Router();

function safeDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function makeId(scope: string, stateCode: string | null, externalId: string): string {
  const hash = createHash("sha256")
    .update(`${scope}::${stateCode ?? "federal"}::${externalId}`)
    .digest("hex");
  return [hash.slice(0, 8), hash.slice(8, 12), "5" + hash.slice(13, 16), hash.slice(16, 20), hash.slice(20, 32)].join("-");
}

router.get("/intel-feed", async (req, res) => {
  const {
    scope,
    stateCode,
    signalType,
    feedback,
    page: pageStr = "1",
    limit: limitStr = "50",
  } = req.query as Record<string, string>;

  const page = Math.max(1, parseInt(pageStr, 10));
  const limit = Math.min(200, Math.max(1, parseInt(limitStr, 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions: any[] = [];
    if (scope) conditions.push(eq(intelFeedItemsTable.scope, scope as any));
    if (stateCode) conditions.push(eq(intelFeedItemsTable.stateCode, stateCode));
    if (signalType && signalType !== "all") conditions.push(eq(intelFeedItemsTable.signalType, signalType as any));
    if (feedback && feedback !== "all") conditions.push(eq(intelFeedItemsTable.feedback, feedback as any));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(intelFeedItemsTable)
        .where(where)
        .orderBy(desc(intelFeedItemsTable.publishedDate), desc(intelFeedItemsTable.fetchedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: countFn() }).from(intelFeedItemsTable).where(where),
    ]);

    const total = Number(totalRows[0]?.count ?? 0);
    return res.json({ items: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list intel feed items" });
  }
});

router.patch("/intel-feed/:id/feedback", async (req, res) => {
  const { id } = req.params;
  const { feedback } = req.body as { feedback: "saved" | "dismissed" | "new" };

  if (!["saved", "dismissed", "new"].includes(feedback)) {
    return res.status(400).json({ error: "Invalid feedback value" });
  }

  try {
    const rows = await db
      .update(intelFeedItemsTable)
      .set({ feedback: feedback as any, updatedAt: new Date() })
      .where(eq(intelFeedItemsTable.id, id))
      .returning();

    if (!rows.length) return res.status(404).json({ error: "Item not found" });

    const item = rows[0]!;
    if (feedback !== "new") {
      await upsertSignal(
        item.signalType,
        item.source,
        item.stateCode ?? null,
        feedback === "saved" ? 1 : 0,
        feedback === "dismissed" ? 1 : 0,
      );
    }

    return res.json({ item });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update feedback" });
  }
});

router.get("/intel-feed/signals", async (_req, res) => {
  try {
    const rows = await db.select().from(intelFeedSignalsTable).orderBy(desc(intelFeedSignalsTable.updatedAt));
    return res.json({ signals: rows });
  } catch {
    return res.status(500).json({ error: "Failed to get signals" });
  }
});

router.post("/intel-feed/fetch", async (req, res) => {
  const { scope = "federal", stateCode } = req.body as { scope?: "federal" | "state"; stateCode?: string };

  try {
    const now = new Date();
    const externalId = `${scope}::${stateCode ?? "federal"}::manual-fetch::${now.toISOString().slice(0, 10)}`;
    const id = makeId(scope, stateCode ?? null, externalId);
    const publishedDate = safeDate(now);

    await db
      .insert(intelFeedItemsTable)
      .values({
        id,
        scope,
        stateCode: stateCode ?? null,
        signalType: "other",
        source: "other",
        agency: "Insight Hub",
        title: "Manual intel fetch completed",
        summary: "The intel feed fetch endpoint is active. Source fetchers can be re-enabled after the recovery build is stable.",
        sourceUrl: null,
        publishedDate,
        feedback: "new",
        relevanceScore: 50,
        externalId,
        rawJson: JSON.stringify({ recovered: true, timestamp: now.toISOString() }),
        fetchedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    return res.json({ fetched: 1, created: 1, updated: 0, scope, stateCode, errors: [] });
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: err?.message ?? "Fetch failed" });
  }
});

async function upsertSignal(
  signalType: IntelSignalType,
  source: IntelSource,
  stateCode: string | null,
  saved: number,
  dismissed: number,
) {
  const sigId = makeId("signal", stateCode, `${signalType}::${source}`);
  await db
    .insert(intelFeedSignalsTable)
    .values({
      id: sigId,
      signalType,
      source,
      stateCode,
      savedCount: saved,
      dismissedCount: dismissed,
      totalCount: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: intelFeedSignalsTable.id,
      set: {
        savedCount: sql`${intelFeedSignalsTable.savedCount} + ${saved}`,
        dismissedCount: sql`${intelFeedSignalsTable.dismissedCount} + ${dismissed}`,
        totalCount: sql`${intelFeedSignalsTable.totalCount} + 1`,
        updatedAt: new Date(),
      },
    });
}

export default router;
