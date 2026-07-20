import type { OpportunityDedupeKey } from "./opportunityIdentity";

export const ACTIVE_INGESTION_STATUSES = new Set(["queued", "running"]);

export function isActiveIngestionStatus(status: string): boolean {
  return ACTIVE_INGESTION_STATUSES.has(status);
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
