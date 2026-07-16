import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { like } from "drizzle-orm";
import type { PublicPortalSource } from "./catalog";

const HEALTH_KEY_PREFIX = "internal:public-portal-health:";

export type PublicPortalRunOutcome =
  | "success"
  | "no_results"
  | "failed"
  | "validation_failed";

export interface PublicPortalSourceRunStatus {
  sourceId: string;
  sourceName?: string;
  domain?: string;
  lastCheckedAt: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastFailureReason?: string;
  resultCount: number;
  matchedCount: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastOutcome: PublicPortalRunOutcome;
}

interface StoredPortalSourceRunStatus {
  sourceId: string;
  sourceName?: string;
  domain?: string;
  lastCheckedAt: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  resultCount: number;
  matchedCount: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastOutcome: PublicPortalRunOutcome;
}

function healthKey(sourceId: string): string {
  return `${HEALTH_KEY_PREFIX}${sourceId}`;
}

function validDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseStoredStatus(value: string): PublicPortalSourceRunStatus | undefined {
  try {
    const stored = JSON.parse(value) as Partial<StoredPortalSourceRunStatus>;
    if (!stored.sourceId || !stored.lastCheckedAt || !stored.lastOutcome) return undefined;
    const lastCheckedAt = validDate(stored.lastCheckedAt);
    if (!lastCheckedAt) return undefined;
    return {
      sourceId: stored.sourceId,
      sourceName: stored.sourceName,
      domain: stored.domain,
      lastCheckedAt,
      lastSuccessAt: validDate(stored.lastSuccessAt),
      lastFailureAt: validDate(stored.lastFailureAt),
      lastFailureReason: stored.lastFailureReason,
      resultCount: Number.isFinite(stored.resultCount) ? Number(stored.resultCount) : 0,
      matchedCount: Number.isFinite(stored.matchedCount) ? Number(stored.matchedCount) : 0,
      totalAttempts: Number.isFinite(stored.totalAttempts) ? Number(stored.totalAttempts) : 0,
      totalSuccesses: Number.isFinite(stored.totalSuccesses) ? Number(stored.totalSuccesses) : 0,
      totalFailures: Number.isFinite(stored.totalFailures) ? Number(stored.totalFailures) : 0,
      consecutiveFailures: Number.isFinite(stored.consecutiveFailures) ? Number(stored.consecutiveFailures) : 0,
      lastOutcome: stored.lastOutcome,
    };
  } catch {
    return undefined;
  }
}

function serializeStatus(status: PublicPortalSourceRunStatus): string {
  const stored: StoredPortalSourceRunStatus = {
    ...status,
    lastCheckedAt: status.lastCheckedAt.toISOString(),
    lastSuccessAt: status.lastSuccessAt?.toISOString(),
    lastFailureAt: status.lastFailureAt?.toISOString(),
  };
  return JSON.stringify(stored);
}

export async function loadPublicPortalHealth(): Promise<Map<string, PublicPortalSourceRunStatus>> {
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(like(settingsTable.key, `${HEALTH_KEY_PREFIX}%`));

  const statuses = new Map<string, PublicPortalSourceRunStatus>();
  for (const row of rows) {
    const parsed = parseStoredStatus(row.value);
    if (parsed) statuses.set(parsed.sourceId, parsed);
  }
  return statuses;
}

export async function savePublicPortalHealth(status: PublicPortalSourceRunStatus): Promise<void> {
  const key = healthKey(status.sourceId);
  const value = serializeStatus(status);
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

export function successfulPortalStatus(
  source: PublicPortalSource,
  prior: PublicPortalSourceRunStatus | undefined,
  checkedAt: Date,
  resultCount: number,
  matchedCount: number,
): PublicPortalSourceRunStatus {
  const foundResults = resultCount > 0;
  return {
    sourceId: source.id,
    sourceName: source.name,
    domain: source.domain,
    lastCheckedAt: checkedAt,
    lastSuccessAt: checkedAt,
    lastFailureAt: prior?.lastFailureAt,
    lastFailureReason: prior?.lastFailureReason,
    resultCount,
    matchedCount,
    totalAttempts: (prior?.totalAttempts ?? 0) + 1,
    totalSuccesses: (prior?.totalSuccesses ?? 0) + 1,
    totalFailures: prior?.totalFailures ?? 0,
    consecutiveFailures: 0,
    lastOutcome: foundResults ? "success" : "no_results",
  };
}

export function failedPortalStatus(
  source: PublicPortalSource,
  prior: PublicPortalSourceRunStatus | undefined,
  checkedAt: Date,
  reason: string,
  outcome: "failed" | "validation_failed" = "failed",
): PublicPortalSourceRunStatus {
  return {
    sourceId: source.id,
    sourceName: source.name,
    domain: source.domain,
    lastCheckedAt: checkedAt,
    lastSuccessAt: prior?.lastSuccessAt,
    lastFailureAt: checkedAt,
    lastFailureReason: reason.slice(0, 1_000),
    resultCount: 0,
    matchedCount: 0,
    totalAttempts: (prior?.totalAttempts ?? 0) + 1,
    totalSuccesses: prior?.totalSuccesses ?? 0,
    totalFailures: (prior?.totalFailures ?? 0) + 1,
    consecutiveFailures: (prior?.consecutiveFailures ?? 0) + 1,
    lastOutcome: outcome,
  };
}

export function selectFairPortalSources(
  sources: readonly PublicPortalSource[],
  statuses: ReadonlyMap<string, PublicPortalSourceRunStatus>,
  rotatingBatchSize: number,
  dedicatedSourceIds: ReadonlySet<string>,
): { selected: PublicPortalSource[]; deferred: PublicPortalSource[] } {
  const dedicated = sources.filter((source) => dedicatedSourceIds.has(source.id));
  const rotating = sources
    .filter((source) => !dedicatedSourceIds.has(source.id))
    .sort((left, right) => {
      const leftAttempt = statuses.get(left.id)?.lastCheckedAt.getTime() ?? 0;
      const rightAttempt = statuses.get(right.id)?.lastCheckedAt.getTime() ?? 0;
      if (leftAttempt !== rightAttempt) return leftAttempt - rightAttempt;
      return left.id.localeCompare(right.id);
    });

  const selectedRotating = rotating.slice(0, Math.max(0, rotatingBatchSize));
  const selectedIds = new Set([...dedicated, ...selectedRotating].map((source) => source.id));
  return {
    selected: sources.filter((source) => selectedIds.has(source.id)),
    deferred: sources.filter((source) => !selectedIds.has(source.id)),
  };
}
