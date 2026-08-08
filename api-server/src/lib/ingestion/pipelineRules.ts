import type { OpportunityDedupeKey } from "./opportunityIdentity";

export const ACTIVE_INGESTION_STATUSES = new Set(["queued", "running"]);
export const STALE_INGESTION_RUN_AFTER_MS = 30 * 60 * 1000;

const SOURCE_CONFIDENCE_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const CANONICAL_PROVIDER_AUTHORITY: Record<string, number> = {
  samgov: 100,
  sam_gov: 100,
  tango: 90,
  texasesbd: 80,
  nyscr: 80,
  eunabonfire: 80,
  publicportalproviders: 70,
  stateportals: 70,
  internationalpublicportals: 65,
  langsearch: 30,
  serper: 30,
  exa: 30,
  parallel: 30,
  linkup: 30,
  you: 30,
  socrata: 30,
  websearch: 30,
  aidiscovery: 25,
  rssaggregator: 20,
  manual: 10,
};

const CANONICAL_OWNER_FIELDS = new Set([
  "noticeId",
  "providerKey",
  "providerName",
  "source",
  "samUrl",
]);

const PRESERVED_FIELDS = new Set([
  "id",
  "createdAt",
  "firstSeenAt",
  "notes",
  "userGrade",
  "userConfidence",
]);

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

/**
 * Lock every identity that could collapse to the same canonical row. Sorting
 * makes concurrent cross-provider acquisitions deterministic and avoids two
 * processes taking provider/solicitation locks in opposite orders.
 */
export function opportunityIdentityLockKeys(
  keys: OpportunityDedupeKey[],
  fallbackKey: string,
): string[] {
  const values = Array.from(new Set(keys.map((key) => key.value).filter(Boolean))).sort();
  return values.length > 0 ? values : [fallbackKey];
}

export function canonicalProviderAuthority(value: unknown): number {
  const normalized = String(value ?? "")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase();
  return CANONICAL_PROVIDER_AUTHORITY[normalized] ?? 0;
}

function ownerIdentity(value: Record<string, unknown>): string {
  return String(value.providerKey ?? value.providerName ?? value.source ?? "")
    .trim()
    .toLowerCase();
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function parseTagValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value
      .split(/[,;|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function mergeTags(existing: unknown, incoming: unknown): string | unknown {
  const tags = Array.from(new Set([...parseTagValues(existing), ...parseTagValues(incoming)]));
  if (tags.length === 0) return hasMeaningfulValue(incoming) ? incoming : existing;
  return JSON.stringify(tags);
}

function strongerConfidence(existing: unknown, incoming: unknown): unknown {
  const current = String(existing ?? "").toLowerCase();
  const next = String(incoming ?? "").toLowerCase();
  if (!SOURCE_CONFIDENCE_RANK[next]) return existing;
  if (!SOURCE_CONFIDENCE_RANK[current]) return incoming;
  return SOURCE_CONFIDENCE_RANK[next] >= SOURCE_CONFIDENCE_RANK[current]
    ? incoming
    : existing;
}

/**
 * Merge a canonical refresh without allowing a lower-authority source to erase
 * richer fields or steal canonical source ownership. Same-provider amendments
 * and higher-authority sources may replace populated source fields; lower or
 * equal authority cross-provider records may only fill gaps. User fields and
 * canonical creation identity are always preserved.
 */
export function mergeSourceRefresh<T extends Record<string, unknown>>(
  existing: T,
  sourceFields: T,
): T {
  const existingOwner = ownerIdentity(existing);
  const incomingOwner = ownerIdentity(sourceFields);
  const incomingOwnsCanonical =
    !existingOwner ||
    existingOwner === incomingOwner ||
    canonicalProviderAuthority(incomingOwner) > canonicalProviderAuthority(existingOwner);

  const merged: Record<string, unknown> = { ...existing };
  for (const [key, incoming] of Object.entries(sourceFields)) {
    if (PRESERVED_FIELDS.has(key)) continue;
    if (key === "tags") {
      merged.tags = mergeTags(existing.tags, incoming);
      continue;
    }
    if (key === "sourceConfidence") {
      merged.sourceConfidence = strongerConfidence(existing.sourceConfidence, incoming);
      continue;
    }
    if (!hasMeaningfulValue(incoming)) continue;

    const current = existing[key];
    const mayReplace = incomingOwnsCanonical || !hasMeaningfulValue(current);
    if (CANONICAL_OWNER_FIELDS.has(key)) {
      if (incomingOwnsCanonical || !hasMeaningfulValue(current)) merged[key] = incoming;
      continue;
    }
    if (mayReplace) merged[key] = incoming;
  }

  for (const field of PRESERVED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(existing, field)) merged[field] = existing[field];
  }
  return merged as T;
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
