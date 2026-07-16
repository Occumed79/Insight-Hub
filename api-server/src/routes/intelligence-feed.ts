/**
 * Intelligence Feed Routes
 *
 * Federal intelligence combines Grants.gov funding signals with USAJOBS
 * workforce-hiring signals. State intelligence is collected from official state
 * procurement portals and official government pages through Serper. None of
 * these paths write to the RFP Opportunities feed.
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
  type IntelScope,
} from "@workspace/db/schema";
import { grantsGovProvider } from "../lib/providers/grantsGov";
import type { NormalizedOpportunity } from "../lib/providers/types";
import {
  fetchStateIntelligence,
  STATE_NAMES,
  type StateIntelligenceRecord,
} from "../lib/intelligence/stateIntelligence";
import {
  fetchUsaJobsWorkforceIntelligence,
  type UsaJobsWorkforceRecord,
} from "../lib/intelligence/usaJobsIntelligence";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

interface FeedRecordInput {
  externalId: string;
  signalType: IntelSignalType;
  source: IntelSource;
  agency: string | null;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  publishedDate: Date | null;
  relevanceScore: number;
  rawJson: string;
}

function safeDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizedDateRange(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(1, Math.floor(parsed)));
}

function makeId(scope: string, stateCode: string | null, externalId: string): string {
  const hash = createHash("sha256")
    .update(`${scope}::${stateCode ?? "federal"}::${externalId}`)
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "5" + hash.slice(13, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

function grantSignalType(record: NormalizedOpportunity): IntelSignalType {
  const status = String(record.rawData?.["opportunity_status"] ?? "").toLowerCase();
  const text = `${record.title} ${record.description ?? ""}`.toLowerCase();
  if (
    status.includes("forecast") ||
    /\b(forecast|anticipated funding|notice of intent)\b/.test(text)
  ) {
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
  const priorityAgency =
    /department of labor|occupational safety|cdc|hrsa|department of defense|veterans affairs|homeland security/.test(
      text,
    );
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
    details.push(
      `Application deadline: ${deadline.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })}.`,
    );
  }

  const funding = formatFunding(record.estimatedValue);
  if (funding) details.push(`Estimated program funding: ${funding}.`);
  if (record.solicitationNumber) {
    details.push(`Opportunity number: ${record.solicitationNumber}.`);
  }

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

async function upsertFeedRecords(options: {
  scope: IntelScope;
  stateCode: string | null;
  records: FeedRecordInput[];
  now: Date;
}): Promise<{ created: number; updated: number }> {
  const ids = options.records.map((record) =>
    makeId(options.scope, options.stateCode, record.externalId),
  );
  const existingRows =
    ids.length > 0
      ? await db
          .select({ id: intelFeedItemsTable.id })
          .from(intelFeedItemsTable)
          .where(inArray(intelFeedItemsTable.id, ids))
      : [];
  const existingIds = new Set(existingRows.map((row) => row.id));

  let created = 0;
  let updated = 0;

  for (const record of options.records) {
    const id = makeId(options.scope, options.stateCode, record.externalId);
    const values = {
      id,
      scope: options.scope,
      stateCode: options.stateCode,
      signalType: record.signalType,
      source: record.source,
      agency: record.agency,
      title: record.title,
      summary: record.summary,
      sourceUrl: record.sourceUrl,
      publishedDate: record.publishedDate,
      relevanceScore: record.relevanceScore,
      externalId: record.externalId,
      rawJson: record.rawJson,
      fetchedAt: options.now,
      updatedAt: options.now,
    };

    await db
      .insert(intelFeedItemsTable)
      .values({
        ...values,
        feedback: "new",
        createdAt: options.now,
      })
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

  return { created, updated };
}

function grantToFeedRecord(record: NormalizedOpportunity, now: Date): FeedRecordInput {
  return {
    externalId: record.externalId,
    signalType: grantSignalType(record),
    source: "grants_gov",
    agency: record.agency ?? "Federal Agency",
    title: record.title,
    summary: grantSummary(record),
    sourceUrl: record.sourceUrl ?? null,
    publishedDate: safeDate(record.postedDate) ?? now,
    relevanceScore: grantRelevanceScore(record),
    rawJson: JSON.stringify({
      ...(record.rawData ?? {}),
      responseDeadline: safeDate(record.responseDeadline)?.toISOString() ?? null,
      estimatedValue: record.estimatedValue ?? null,
      solicitationNumber: record.solicitationNumber ?? null,
    }),
  };
}

function usaJobsToFeedRecord(record: UsaJobsWorkforceRecord): FeedRecordInput {
  return {
    externalId: record.externalId,
    signalType: "workforce_hiring",
    source: "usajobs",
    agency: record.agency,
    title: record.title,
    summary: record.summary,
    sourceUrl: record.sourceUrl,
    publishedDate: record.publishedDate,
    relevanceScore: record.relevanceScore,
    rawJson: JSON.stringify(record.rawData),
  };
}

function stateToFeedRecord(record: StateIntelligenceRecord): FeedRecordInput {
  return {
    externalId: record.externalId,
    signalType: record.signalType,
    source: record.source,
    agency: record.agency,
    title: record.title,
    summary: record.summary,
    sourceUrl: record.sourceUrl,
    publishedDate: record.publishedDate,
    relevanceScore: record.relevanceScore,
    rawJson: JSON.stringify(record.rawData),
  };
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
    if (scope) conditions.push(eq(intelFeedItemsTable.scope, scope as IntelScope));
    if (stateCode) conditions.push(eq(intelFeedItemsTable.stateCode, stateCode));
    if (signalType && signalType !== "all") {
      conditions.push(eq(intelFeedItemsTable.signalType, signalType as IntelSignalType));
    }
    if (feedback && feedback !== "all") {
      conditions.push(eq(intelFeedItemsTable.feedback, feedback as any));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(intelFeedItemsTable)
        .where(where)
        .orderBy(
          desc(intelFeedItemsTable.publishedDate),
          desc(intelFeedItemsTable.fetchedAt),
        )
        .limit(limit)
        .offset(offset),
      db.select({ count: countFn() }).from(intelFeedItemsTable).where(where),
    ]);

    const total = Number(totalRows[0]?.count ?? 0);
    return res.json({
      items: rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
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
      .set({ feedback, updatedAt: new Date() })
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
    const rows = await db
      .select()
      .from(intelFeedSignalsTable)
      .orderBy(desc(intelFeedSignalsTable.updatedAt));
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
    const now = new Date();
    const range = normalizedDateRange(dateRange);

    if (scope === "federal") {
      const [grantResult, workforceResult] = await Promise.all([
        grantsGovProvider.fetch({
          keywords,
          dateRange: range,
          limit: 250,
        }),
        fetchUsaJobsWorkforceIntelligence({
          keywords,
          dateRange: range,
          limit: 150,
        }),
      ]);

      const grantRecords = grantResult.records.filter((record) =>
        isCurrentGrant(record, range, now),
      );
      const feedRecords = [
        ...grantRecords.map((record) => grantToFeedRecord(record, now)),
        ...workforceResult.records.map(usaJobsToFeedRecord),
      ];
      const counts = await upsertFeedRecords({
        scope: "federal",
        stateCode: null,
        records: feedRecords,
        now,
      });

      return res.json({
        fetched: feedRecords.length,
        ...counts,
        scope,
        stateCode: null,
        sources: ["grants_gov", "usajobs"],
        sourceResults: [
          {
            source: "grants_gov",
            fetched: grantRecords.length,
            errors: grantResult.errors,
          },
          {
            source: "usajobs",
            fetched: workforceResult.records.length,
            configured: workforceResult.configured,
            errors: workforceResult.errors,
          },
        ],
        errors: [...grantResult.errors, ...workforceResult.errors],
      });
    }

    const normalizedStateCode = stateCode?.trim().toUpperCase() ?? "";
    if (!STATE_NAMES[normalizedStateCode]) {
      return res.status(400).json({
        error: normalizedStateCode
          ? `Unknown state code: ${normalizedStateCode}`
          : "A state code is required for state intelligence.",
      });
    }

    const fetchResult = await fetchStateIntelligence({
      stateCode: normalizedStateCode,
      dateRange: range,
      keywords,
      limit: 100,
    });
    const counts = await upsertFeedRecords({
      scope: "state",
      stateCode: normalizedStateCode,
      records: fetchResult.records.map(stateToFeedRecord),
      now,
    });

    return res.json({
      fetched: fetchResult.records.length,
      ...counts,
      scope: "state",
      stateCode: normalizedStateCode,
      stateName: STATE_NAMES[normalizedStateCode],
      sources: fetchResult.sources,
      errors: fetchResult.errors,
    });
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
