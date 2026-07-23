import { rfpDb as db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { like } from "drizzle-orm";
import type { PublicPortalSource } from "./catalog";

const HEALTH_KEY_PREFIX = "internal:public-portal-health:";

export const DEFAULT_PORTAL_FAILURE_QUARANTINE_THRESHOLD = 3;
export const DEFAULT_PORTAL_EMPTY_QUARANTINE_THRESHOLD = 6;

export type PublicPortalRunOutcome =
  | "success"
  | "no_results"
  | "failed"
  | "validation_failed";

export type PublicPortalQuarantineReason =
  | "validation_failed"
  | "repeated_failures"
  | "repeated_empty_results";

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
  lifetimeResultCount: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  consecutiveFailures: number;
  consecutiveNoResultSuccesses: number;
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
  lifetimeResultCount?: number;
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  consecutiveFailures: number;
  consecutiveNoResultSuccesses?: number;
  lastOutcome: PublicPortalRunOutcome;
}

export interface PublicPortalQuarantineDecision {
  quarantined: boolean;
  reason?: PublicPortalQuarantineReason;
}

export interface PublicPortalQuarantineThresholds {
  failureThreshold?: number;
  emptyThreshold?: number;
}

export interface PublicPortalSourceSelection {
  selected: PublicPortalSource[];
  deferred: PublicPortalSource[];
  quarantined: Array<{
    source: PublicPortalSource;
    reason: PublicPortalQuarantineReason;
  }>;
}

function healthKey(sourceId: string): string {
  return `${HEALTH_KEY_PREFIX}${sourceId}`;
}

function validDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
      resultCount: finiteNumber(stored.resultCount),
      matchedCount: finiteNumber(stored.matchedCount),
      lifetimeResultCount: finiteNumber(stored.lifetimeResultCount),
      totalAttempts: finiteNumber(stored.totalAttempts),
      totalSuccesses: finiteNumber(stored.totalSuccesses),
      totalFailures: finiteNumber(stored.totalFailures),
      consecutiveFailures: finiteNumber(stored.consecutiveFailures),
      consecutiveNoResultSuccesses: finiteNumber(
        stored.consecutiveNoResultSuccesses,
      ),
      lastOutcome: stored.lastOutcome,
    };
  } catch {
    return undefined;
  }
}

function serializeStatus(status: PublicPortalSourceRunStatus): string {
  const stored: StoredPortalSourceRunStatus = {
    sourceId: status.sourceId,
    sourceName: status.sourceName,
    domain: status.domain,
    lastCheckedAt: status.lastCheckedAt.toISOString(),
    lastSuccessAt: status.lastSuccessAt?.toISOString(),
    lastFailureAt: status.lastFailureAt?.toISOString(),
    lastFailureReason: status.lastFailureReason,
    resultCount: status.resultCount,
    matchedCount: status.matchedCount,
    lifetimeResultCount: status.lifetimeResultCount,
    totalAttempts: status.totalAttempts,
    totalSuccesses: status.totalSuccesses,
    totalFailures: status.totalFailures,
    consecutiveFailures: status.consecutiveFailures,
    consecutiveNoResultSuccesses: status.consecutiveNoResultSuccesses,
    lastOutcome: status.lastOutcome,
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
    sourceName: source.agencyName,
    domain: source.domain,
    lastCheckedAt: checkedAt,
    lastSuccessAt: checkedAt,
    lastFailureAt: prior?.lastFailureAt,
    lastFailureReason: prior?.lastFailureReason,
    resultCount,
    matchedCount,
    lifetimeResultCount: (prior?.lifetimeResultCount ?? 0) + resultCount,
    totalAttempts: (prior?.totalAttempts ?? 0) + 1,
    totalSuccesses: (prior?.totalSuccesses ?? 0) + 1,
    totalFailures: prior?.totalFailures ?? 0,
    consecutiveFailures: 0,
    consecutiveNoResultSuccesses: foundResults
      ? 0
      : (prior?.consecutiveNoResultSuccesses ?? 0) + 1,
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
    sourceName: source.agencyName,
    domain: source.domain,
    lastCheckedAt: checkedAt,
    lastSuccessAt: prior?.lastSuccessAt,
    lastFailureAt: checkedAt,
    lastFailureReason: reason.slice(0, 1_000),
    resultCount: 0,
    matchedCount: 0,
    lifetimeResultCount: prior?.lifetimeResultCount ?? 0,
    totalAttempts: (prior?.totalAttempts ?? 0) + 1,
    totalSuccesses: prior?.totalSuccesses ?? 0,
    totalFailures: (prior?.totalFailures ?? 0) + 1,
    consecutiveFailures: (prior?.consecutiveFailures ?? 0) + 1,
    consecutiveNoResultSuccesses: 0,
    lastOutcome: outcome,
  };
}

export function portalQuarantineDecision(
  status: PublicPortalSourceRunStatus | undefined,
  thresholds: PublicPortalQuarantineThresholds = {},
): PublicPortalQuarantineDecision {
  if (!status) return { quarantined: false };

  if (status.lastOutcome === "validation_failed") {
    return { quarantined: true, reason: "validation_failed" };
  }

  const failureThreshold = Math.max(
    1,
    Math.floor(
      thresholds.failureThreshold ?? DEFAULT_PORTAL_FAILURE_QUARANTINE_THRESHOLD,
    ),
  );
  if (status.consecutiveFailures >= failureThreshold) {
    return { quarantined: true, reason: "repeated_failures" };
  }

  const emptyThreshold = Math.max(
    1,
    Math.floor(
      thresholds.emptyThreshold ?? DEFAULT_PORTAL_EMPTY_QUARANTINE_THRESHOLD,
    ),
  );
  if (
    status.lastOutcome === "no_results" &&
    status.consecutiveNoResultSuccesses >= emptyThreshold
  ) {
    return { quarantined: true, reason: "repeated_empty_results" };
  }

  return { quarantined: false };
}

export function portalQuarantineReasonLabel(
  reason: PublicPortalQuarantineReason,
): string {
  if (reason === "validation_failed") return "Invalid source configuration";
  if (reason === "repeated_failures") return "Repeated collection failures";
  return "Repeated healthy checks returned no records";
}

function lastCheckedTime(
  source: PublicPortalSource,
  statuses: ReadonlyMap<string, PublicPortalSourceRunStatus>,
): number {
  return statuses.get(source.id)?.lastCheckedAt.getTime() ?? 0;
}

function oldestFirst(
  statuses: ReadonlyMap<string, PublicPortalSourceRunStatus>,
): (left: PublicPortalSource, right: PublicPortalSource) => number {
  return (left, right) => {
    const attemptDifference =
      lastCheckedTime(left, statuses) - lastCheckedTime(right, statuses);
    return attemptDifference !== 0
      ? attemptDifference
      : left.id.localeCompare(right.id);
  };
}

/**
 * Selects a bounded, durable rotation instead of running every dedicated adapter
 * at once. Dedicated sources receive most of the batch, while generic sources
 * retain guaranteed capacity. Sources that repeatedly fail or repeatedly return
 * no records are quarantined and removed from the automated rotation.
 */
export function selectFairPortalSources(
  sources: readonly PublicPortalSource[],
  statuses: ReadonlyMap<string, PublicPortalSourceRunStatus>,
  rotatingBatchSize: number,
  dedicatedSourceIds: ReadonlySet<string>,
  quarantineThresholds: PublicPortalQuarantineThresholds = {},
): PublicPortalSourceSelection {
  const quarantined = sources.flatMap((source) => {
    const decision = portalQuarantineDecision(
      statuses.get(source.id),
      quarantineThresholds,
    );
    return decision.quarantined && decision.reason
      ? [{ source, reason: decision.reason }]
      : [];
  });
  const quarantinedIds = new Set(quarantined.map((item) => item.source.id));
  const activeSources = sources.filter((source) => !quarantinedIds.has(source.id));

  const batchSize = Math.min(
    activeSources.length,
    Math.max(0, Math.floor(rotatingBatchSize)),
  );
  if (batchSize === 0) {
    return { selected: [], deferred: [...activeSources], quarantined };
  }

  const compare = oldestFirst(statuses);
  const dedicated = activeSources
    .filter((source) => dedicatedSourceIds.has(source.id))
    .sort(compare);
  const rotating = activeSources
    .filter((source) => !dedicatedSourceIds.has(source.id))
    .sort(compare);

  const dedicatedBudget = dedicated.length === 0
    ? 0
    : Math.min(
        dedicated.length,
        Math.max(1, Math.ceil(batchSize * 0.75)),
      );
  const selected = [
    ...dedicated.slice(0, dedicatedBudget),
    ...rotating.slice(0, Math.max(0, batchSize - dedicatedBudget)),
  ];

  if (selected.length < batchSize) {
    const selectedIds = new Set(selected.map((source) => source.id));
    const overflow = [...dedicated, ...rotating]
      .filter((source) => !selectedIds.has(source.id))
      .sort(compare)
      .slice(0, batchSize - selected.length);
    selected.push(...overflow);
  }

  const selectedIds = new Set(selected.map((source) => source.id));
  return {
    selected,
    deferred: activeSources
      .filter((source) => !selectedIds.has(source.id))
      .sort(compare),
    quarantined,
  };
}
