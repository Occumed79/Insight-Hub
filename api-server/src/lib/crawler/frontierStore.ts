import { eq, like } from "drizzle-orm";
import { rfpDb as db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";

import type { CrawlFrontierState, CrawlOutcome } from "./types";

const FRONTIER_KEY_PREFIX = "internal:crawler-frontier:";
const DEFAULT_SCHEDULE_MINUTES = 60;
const MAX_BACKOFF_MINUTES = 24 * 60;

function keyFor(sourceId: string, spiderId: string): string {
  return `${FRONTIER_KEY_PREFIX}${sourceId}:${spiderId}`;
}

function parseState(value: string): CrawlFrontierState | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<CrawlFrontierState>;
    if (!parsed.sourceId || !parsed.spiderId || !parsed.nextRunAt) return undefined;
    return {
      sourceId: parsed.sourceId,
      spiderId: parsed.spiderId,
      nextRunAt: parsed.nextRunAt,
      lastAttemptAt: parsed.lastAttemptAt,
      lastSuccessAt: parsed.lastSuccessAt,
      lastOutcome: parsed.lastOutcome,
      lastError: parsed.lastError,
      consecutiveFailures: Number(parsed.consecutiveFailures ?? 0),
      etag: parsed.etag,
      lastModified: parsed.lastModified,
      contentHash: parsed.contentHash,
      cursor: parsed.cursor,
      pagesCrawled: Number(parsed.pagesCrawled ?? 0),
      urlsVisited: Number(parsed.urlsVisited ?? 0),
      recordsFound: Number(parsed.recordsFound ?? 0),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}

export async function loadCrawlFrontier(
  sourceId: string,
  spiderId: string,
): Promise<CrawlFrontierState | undefined> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, keyFor(sourceId, spiderId)))
    .limit(1);
  return row ? parseState(row.value) : undefined;
}

export async function listCrawlFrontier(): Promise<CrawlFrontierState[]> {
  const rows = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(like(settingsTable.key, `${FRONTIER_KEY_PREFIX}%`));
  return rows.flatMap((row) => {
    const parsed = parseState(row.value);
    return parsed ? [parsed] : [];
  });
}

export async function saveCrawlFrontier(
  state: CrawlFrontierState,
): Promise<void> {
  const value = JSON.stringify(state);
  await db
    .insert(settingsTable)
    .values({ key: keyFor(state.sourceId, state.spiderId), value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

export function initialFrontierState(
  sourceId: string,
  spiderId: string,
  now = new Date(),
): CrawlFrontierState {
  return {
    sourceId,
    spiderId,
    nextRunAt: now.toISOString(),
    consecutiveFailures: 0,
    pagesCrawled: 0,
    urlsVisited: 0,
    recordsFound: 0,
    updatedAt: now.toISOString(),
  };
}

export function isFrontierDue(
  state: CrawlFrontierState | undefined,
  now = new Date(),
): boolean {
  if (!state) return true;
  const next = new Date(state.nextRunAt);
  return Number.isNaN(next.getTime()) || next.getTime() <= now.getTime();
}

function nextDelayMinutes(
  outcome: CrawlOutcome,
  scheduleMinutes: number,
  consecutiveFailures: number,
): number {
  if (outcome === "blocked") return Math.min(MAX_BACKOFF_MINUTES, 6 * 60);
  if (outcome === "failed") {
    return Math.min(
      MAX_BACKOFF_MINUTES,
      Math.max(5, scheduleMinutes) * 2 ** Math.min(consecutiveFailures, 5),
    );
  }
  if (outcome === "not_modified") return Math.max(scheduleMinutes, 120);
  return Math.max(5, scheduleMinutes);
}

export function completeFrontierState(options: {
  prior?: CrawlFrontierState;
  sourceId: string;
  spiderId: string;
  outcome: CrawlOutcome;
  error?: string;
  scheduleMinutes?: number;
  etag?: string;
  lastModified?: string;
  contentHash?: string;
  cursor?: string;
  pagesCrawled: number;
  urlsVisited: number;
  recordsFound: number;
  now?: Date;
}): CrawlFrontierState {
  const now = options.now ?? new Date();
  const failed = options.outcome === "failed" || options.outcome === "blocked";
  const consecutiveFailures = failed
    ? (options.prior?.consecutiveFailures ?? 0) + 1
    : 0;
  const delay = nextDelayMinutes(
    options.outcome,
    options.scheduleMinutes ?? DEFAULT_SCHEDULE_MINUTES,
    consecutiveFailures,
  );
  return {
    sourceId: options.sourceId,
    spiderId: options.spiderId,
    nextRunAt: new Date(now.getTime() + delay * 60_000).toISOString(),
    lastAttemptAt: now.toISOString(),
    lastSuccessAt:
      options.outcome === "success" ||
      options.outcome === "no_results" ||
      options.outcome === "not_modified"
        ? now.toISOString()
        : options.prior?.lastSuccessAt,
    lastOutcome: options.outcome,
    lastError: options.error?.slice(0, 2_000),
    consecutiveFailures,
    etag: options.etag ?? options.prior?.etag,
    lastModified: options.lastModified ?? options.prior?.lastModified,
    contentHash: options.contentHash ?? options.prior?.contentHash,
    cursor: options.cursor ?? options.prior?.cursor,
    pagesCrawled: options.pagesCrawled,
    urlsVisited: options.urlsVisited,
    recordsFound: options.recordsFound,
    updatedAt: now.toISOString(),
  };
}
