import { rfpDb as db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { like } from "drizzle-orm";
import type { PublicPortalSource } from "./catalog";

const HEALTH_KEY_PREFIX = "internal:public-portal-health:";

const SOURCE_HEALTH_RESET_AT = new Map<string, number>([
  ["ak-iris-vss", Date.parse("2026-07-23T20:16:19.000Z")],
  ["fl-vbs", Date.parse("2026-07-23T20:16:19.000Z")],
  ["in-idoa", Date.parse("2026-07-23T20:16:19.000Z")],
  ["la-lapac", Date.parse("2026-07-23T20:16:19.000Z")],
  ["ma-commbuys", Date.parse("2026-07-23T20:16:19.000Z")],
  ["nd-spo", Date.parse("2026-07-23T20:16:19.000Z")],
  ["nj-start", Date.parse("2026-07-23T20:16:19.000Z")],
  ["nv-epro", Date.parse("2026-07-23T20:16:19.000Z")],
  ["pa-emarketplace", Date.parse("2026-07-23T20:16:19.000Z")],
  ["ut-purchasing", Date.parse("2026-07-23T20:16:19.000Z")],
  ["vt-bids", Date.parse("2026-07-23T20:16:19.000Z")],
  ["mn-swift", Date.parse("2026-07-23T20:25:00.000Z")],
  ["ri-bids", Date.parse("2026-07-23T21:26:57.000Z")],
  ["wi-vendornet", Date.parse("2026-07-23T21:26:57.000Z")],
  ["ca-siskiyou-county", Date.parse("2026-07-23T21:26:57.000Z")],
  ["ca-sdsu-procurement", Date.parse("2026-07-23T21:26:57.000Z")],
  ["ca-santa-barbara-county", Date.parse("2026-07-23T21:26:57.000Z")],
  ["ca-sacramento-city", Date.parse("2026-07-23T21:26:57.000Z")],
  ["ca-port-of-oakland", Date.parse("2026-07-23T21:26:57.000Z")],
  ["ca-los-angeles-county", Date.parse("2026-07-23T21:26:57.000Z")],
  ["ca-humboldt-county", Date.parse("2026-07-23T21:26:57.000Z")],
  ["ca-bakersfield-purchasing", Date.parse("2026-07-23T21:26:57.000Z")],
  ["az-tucson-airport-authority", Date.parse("2026-07-23T21:26:57.000Z")],
  ["az-phoenix", Date.parse("2026-07-23T21:26:57.000Z")],
  ["fl-orange-county-public-schools", Date.parse("2026-07-23T21:26:57.000Z")],
  ["ct-ctsource", Date.parse("2026-07-23T23:19:00.000Z")],
  ["al-state-procurement", Date.parse("2026-07-23T23:19:00.000Z")],
  ["nm-active-procurements", Date.parse("2026-07-23T23:19:00.000Z")],
]);

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

export function isSupersededPublicPortalHealth(
  status: PublicPortalSourceRunStatus,
): boolean {
  const resetAt = SOURCE_HEALTH_RESET_AT.get(status.sourceId);
  return resetAt !== undefined && status.lastCheckedAt.getTime() < resetAt;
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

export function portalQuarantineDecision(
  status: PublicPortalSourceRunStatus | undefined,
  thresholds: PublicPortalQuarantineThresholds = {},
): PublicPortalQuarantineDecision {
  if (!status) return { quarantined: false };
  const failureThreshold =
    thresholds.failureThreshold ?? DEFAULT_PORTAL_FAILURE_QUARANTINE_THRESHOLD;
  const emptyThreshold =
    thresholds.emptyThreshold ?? DEFAULT_PORTAL_EMPTY_QUARANTINE_THRESHOLD;
  if (status.lastOutcome === "validation_failed") {
    return { quarantined: true, reason: "validation_failed" };
  }
  if (status.consecutiveFailures >= failureThreshold) {
    return { quarantined: true, reason: "repeated_failures" };
  }
  if (status.consecutiveNoResultSuccesses >= emptyThreshold) {
    return { quarantined: true, reason: "repeated_empty_results" };
  }
  return { quarantined: false };
}

export function selectFairPortalSources(
  sources: readonly PublicPortalSource[],
  statuses: ReadonlyMap<string, PublicPortalSourceRunStatus>,
  batchSize: number,
  alwaysRunSourceIds: ReadonlySet<string> = new Set(),
): PublicPortalSourceSelection {
  const eligible: PublicPortalSource[] = [];
  const quarantined: PublicPortalSourceSelection["quarantined"] = [];

  for (const source of sources) {
    if (!source.enabled || source.verificationStatus !== "verified") continue;
    const decision = portalQuarantineDecision(statuses.get(source.id));
    if (decision.quarantined) {
      quarantined.push({ source, reason: decision.reason! });
      continue;
    }
    eligible.push(source);
  }

  const alwaysRun = eligible.filter((source) => alwaysRunSourceIds.has(source.id));
  const rotated = eligible.filter((source) => !alwaysRunSourceIds.has(source.id));
  rotated.sort((left, right) => {
    const leftStatus = statuses.get(left.id);
    const rightStatus = statuses.get(right.id);
    const leftTime = leftStatus?.lastCheckedAt.getTime() ?? 0;
    const rightTime = rightStatus?.lastCheckedAt.getTime() ?? 0;
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });
  const selected = [...alwaysRun, ...rotated.slice(0, Math.max(0, batchSize - alwaysRun.length))];
  const selectedIds = new Set(selected.map((source) => source.id));
  return {
    selected,
    deferred: eligible.filter((source) => !selectedIds.has(source.id)),
    quarantined,
  };
}

export function successfulPortalStatus(
  source: PublicPortalSource,
  prior: PublicPortalSourceRunStatus | undefined,
  checkedAt: Date,
  resultCount: number,
  matchedCount: number,
): PublicPortalSourceRunStatus {
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
    consecutiveNoResultSuccesses:
      resultCount === 0
        ? (prior?.consecutiveNoResultSuccesses ?? 0) + 1
        : 0,
    lastOutcome: resultCount > 0 ? "success" : "no_results",
  };
}

export function failedPortalStatus(
  source: PublicPortalSource,
  prior: PublicPortalSourceRunStatus | undefined,
  checkedAt: Date,
  reason: string,
  outcome: Extract<PublicPortalRunOutcome, "failed" | "validation_failed"> = "failed",
): PublicPortalSourceRunStatus {
  return {
    sourceId: source.id,
    sourceName: source.agencyName,
    domain: source.domain,
    lastCheckedAt: checkedAt,
    lastSuccessAt: prior?.lastSuccessAt,
    lastFailureAt: checkedAt,
    lastFailureReason: reason,
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

export async function loadPublicPortalHealth(): Promise<
  Map<string, PublicPortalSourceRunStatus>
> {
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(like(settingsTable.key, `${HEALTH_KEY_PREFIX}%`));
  const statuses = new Map<string, PublicPortalSourceRunStatus>();
  for (const row of rows) {
    const status = parseStoredStatus(row.value);
    if (!status || isSupersededPublicPortalHealth(status)) continue;
    statuses.set(status.sourceId, status);
  }
  return statuses;
}

export async function savePublicPortalHealth(
  status: PublicPortalSourceRunStatus,
): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key: healthKey(status.sourceId), value: serializeStatus(status) })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value: serializeStatus(status) },
    });
}
