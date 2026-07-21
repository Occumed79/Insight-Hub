import type { OpportunityDedupeKey } from "./opportunityIdentity";

export const ACTIVE_INGESTION_STATUSES = new Set(["queued", "running"]);
export const STALE_INGESTION_RUN_AFTER_MS = 30 * 60 * 1000;

export function isActiveIngestionStatus(status: string): boolean {
  return ACTIVE_INGESTION_STATUSES.has(status);
}

export function isStaleIngestionRun(
  updatedAt: Date,
  now: Date,
  staleAfterMs = STALE_INGESTION_RUN_AFTER_MS,
): boolean {
  return now.getTime() - updatedAt.getTime() >= staleAfterMs;
}

export function failedProvidersForRetry(
  sources: Array<{ provider: string; status: string }>,
): string[] {
  return sources
    .filter((source) => source.status === "failed")
    .map((source) => source.provider);
}

export function classifyIdentityMatch(
  orderedKeys: OpportunityDedupeKey[],
  knownKeys: ReadonlyMap<string, string>,
): { opportunityId: string; matchType: OpportunityDedupeKey["type"] } | null {
  for (const key of orderedKeys) {
    const opportunityId = knownKeys.get(key.value);
    if (opportunityId) return { opportunityId, matchType: key.type };
  }
  return null;
}

export function shouldProtectCanonicalFromRefresh(
  matchType: OpportunityDedupeKey["type"],
  fallback: boolean,
): boolean {
  return fallback || matchType === "url" || matchType === "fingerprint";
}

/**
 * A protected duplicate may update lineage timestamps for the identity that
 * actually matched, but it must not attach stronger provider/solicitation keys
 * that would promote the duplicate into a canonical refresh on a later run.
 */
export function protectedLineageKeys(
  keys: OpportunityDedupeKey[],
  matchType: OpportunityDedupeKey["type"],
): OpportunityDedupeKey[] {
  return keys.filter((key) => key.type === matchType);
}

export function mergeSourceRefresh<T extends Record<string, unknown>>(
  existing: T,
  sourceFields: T,
): T {
  return {
    ...existing,
    ...sourceFields,
    id: existing.id,
    createdAt: existing.createdAt,
    firstSeenAt: existing.firstSeenAt,
    notes: existing.notes,
    userGrade: existing.userGrade,
    userConfidence: existing.userConfidence,
  };
}

export function shouldArchiveForDeadline(
  responseDeadline: Date | null | undefined,
  now: Date,
): boolean {
  return (
    responseDeadline instanceof Date &&
    !Number.isNaN(responseDeadline.getTime()) &&
    responseDeadline < now
  );
}
