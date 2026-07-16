/**
 * Intelligence Feed Routes
 *
 * Provides list, feedback, signals, and source-backed fetch endpoints.
 * Grants.gov is ingested here as funding intelligence and is intentionally kept
 * out of the RFP Opportunities pipeline.
 */

import { Router } from "express";
import { createHash } from "crypto";
import { eq, and, desc, sql, count as countFn, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  intelFeedItemsTable,
  intelFeedSignalsTable,
  type IntelSignalType,
  type IntelSource,
} from "@workspace/db/schema";
import { grantsGovProvider } from "../lib/providers/grantsGov";
import type { NormalizedOpportunity } from "../lib/providers/types";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

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

function grantSignalType(record: NormalizedOpportunity): IntelSignalType {
  const status = String(record.rawData?.["opportunity_status"] ?? "").toLowerCase();
  const text = `${record.title} ${record.description ?? ""}`.toLowerCase();
  if (status.includes("forecast") || /\b(forecast|anticipated funding|notice of intent)\b/.test(text)) {
    return "budget_funding";
  }
  return "grant_program";
}

function grantRelevanceScore(record: NormalizedOpportunity): number {
  const text = `${record.title} ${record.description ?? ""} ${record.agency ?? ""}`.toLowerCase();
  const signalGroups = [
    /occupational health|occupational medicine|employee health/,
    /drug test|drug screen|alcohol test|substance abuse testing/,
    /pre[- ]employment|fitness for duty|fit for duty|medical examination/,
    /medical surveillance|health surveillance|workplace health/,
    /audiometric|hearing conservation|spirometry|pulmonary function|respirator fit/,
    /deployment medical|periodic health assessment|military physical/,
  ];
  const matchedGroups = signalGroups.filter((pattern) => pattern.test(text)).length;
  const priorityAgency = /department of labor|occupational safety|cdc|hrsa|department of defense|veterans affairs|homeland security/.test(text);
  return Math.min(95, 55 + matchedGroups * 7 + (priorityAgency ? 5 : 0));
}

function formatFunding(value: number | undefined): string | null {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value as number);
}

function grantSummary(record: NormalizedOpportunity): string | null {
  const details: string[] = [];
  const description = record.description?.replace(/\s+/g, " ").trim();
  if (description) details.push(description);

  const deadline = safeDate(record.responseDeadline);
  if (deadline) {
    details.push(`Application deadline: ${deadline.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    })}.`);
  }

  const funding = formatFunding(record.estimatedValue);
  if (funding) details.push(`Estimated program funding: ${funding}.`);
  if (record.solicitationNumber) details.push(`Opportunity number: ${record.solicitationNumber}.`);

  return details.length > 0 ? details.join(" ") : null;
}

function isCurrentGrant(record: NormalizedOpportunity, dateRange: number, now: Date): boolean {
  const deadline = safeDate(record.responseDeadline);
  if (deadline && deadline.getTime() < now.getTime()) return false;

  const postedDate = safeDate(record.postedDate);
  if (!postedDate) return true;

  const cutoff = new Date(now.getTime() - Math.max(1, dateRange) * DAY_MS);
  return postedDate >= cutoff || Boolean(deadline && deadline >= now);
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
  const {
    scope = "federal",
    stateCode,
    dateRange = 30,
    keywords,
  } = req.body as {
    scope?: "federal" | "state";
    stateCode?: string;
    dateRange?: number;
    keywords?: string;
  };

  try {
    if (scope === "federal") {
      const now = new Date();
      const normalizedDateRange = Number.isFinite(dateRange)
        ? Math.min(365, Math.max(1, Math.floor(dateRange)))
        : 30;
      const fetchResult = await grantsGovProvider.fetch({
        keywords,
        dateRange: normalizedDateRange,
        limit: 250,
      });
      const records = fetchResult.records.filter((record) =>
        isCurrentGrant(record, normalizedDateRange, now),
      );
      const ids = records.map((record) => makeId("federal", null, record.externalId));
      const existingRows = ids.length > 0
        ? await db
            .select({ id: intelFeedItemsTable.id })
            .from(intelFeedItemsTable)
            .where(inArray(intelFeedItemsTable.id, ids))
        : [];
      const existingIds = new Set(existingRows.map((row) => row.id));

      let created = 0;
      let updated = 0;

      for (const record of records) {
        const id = makeId("federal", null, record.externalId);
        const publishedDate = safeDate(record.postedDate) ?? now;
        const signalType = grantSignalType(record);
        const values = {
          id,
          scope: "federal" as const,
          stateCode: null,
          signalType,
          source: "grants_gov" as const,
          agency: record.agency ?? "Federal Agency",
          title: record.title,
          summary: grantSummary(record),
          sourceUrl: record.sourceUrl ?? null,
          publishedDate,
          relevanceScore: grantRelevanceScore(record),
          externalId: record.externalId,
          rawJson: JSON.stringify({
            ...(record.rawData ?? {}),
            responseDeadline: safeDate(record.responseDeadline)?.toISOString() ?? null,
            estimatedValue: record.estimatedValue ?? null,
            solicitationNumber: record.solicitationNumber ?? null,
          }),
          fetchedAt: now,
          updatedAt: now,
        };

        await db
          .insert(intelFeedItemsTable)
          .values({ ...values, feedback: "new", createdAt: now })
          .onConflictDoUpdate({
            target: intelFeedItemsTable.id,
            set: {
              scope: values.scope,
              stateCode: values.stateCode,
              signalType: values.signalType,
              source: values.source,
              agency: values.agency,
              title: values.title,
              summary: values.summary,
              sourceUrl: values.sourceUrl,
              publishedDate: values.publishedDate,
              relevanceScore: values.relevanceScore,
              externalId: values.externalId,
              rawJson: values.rawJson,
              fetchedAt: values.fetchedAt,
              updatedAt: values.updatedAt,
            },
          });

        if (existingIds.has(id)) updated += 1;
        else created += 1;
      }

      return res.json({
        fetched: records.length,
        created,
        updated,
        scope,
        stateCode: null,
        sources: ["grants_gov"],
        errors: fetchResult.errors,
      });
    }

    // Preserve the existing state-scope recovery behavior until state fetchers are
    // addressed as their own feature. Federal Grants.gov ingestion does not alter it.
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
        summary: "The state intel feed fetch endpoint is active. State source fetchers remain a separate feature.",
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
