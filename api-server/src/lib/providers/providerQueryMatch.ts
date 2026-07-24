import type { NormalizedOpportunity } from "./types";
import { classifyResult, type RelevanceResult } from "../search/relevance";

const GENERIC_QUERY_TERMS = new Set([
  "a",
  "an",
  "and",
  "bid",
  "bids",
  "contract",
  "contracts",
  "for",
  "government",
  "of",
  "opportunities",
  "opportunity",
  "procurement",
  "professional",
  "request",
  "requests",
  "rfi",
  "rfp",
  "rfq",
  "service",
  "services",
  "solicitation",
  "solicitations",
  "the",
  "vendor",
  "vendors",
]);

const OCCUMED_PROFILE_QUERIES = new Set([
  "occupational health",
  "occupational health service",
  "occupational health services",
]);

function normalizedWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function stringTags(record: NormalizedOpportunity): string[] {
  return Array.isArray(record.rawData?.tags)
    ? record.rawData.tags.filter(
        (tag): tag is string => typeof tag === "string",
      )
    : [];
}

/**
 * Provider contracts historically used the Unix epoch as an unknown-date
 * sentinel. Convert that sentinel to a runtime null before raw/staging writes,
 * while retaining an explicit evidence flag for the quality decision.
 */
export function normalizeProviderPostedDate(
  record: NormalizedOpportunity,
): NormalizedOpportunity {
  const value = record.postedDate as Date | null | undefined;
  const invalid = value instanceof Date && Number.isNaN(value.getTime());
  const unknown =
    record.rawData?.dateUnknown === true ||
    value == null ||
    (value instanceof Date && value.getTime() <= 0);
  if (!invalid && !unknown) return record;

  const marker = invalid ? "invalid-posted-date" : "date-unknown";
  return {
    ...record,
    postedDate: null as unknown as Date,
    rawData: {
      ...(record.rawData ?? {}),
      ...(invalid ? { invalidPostedDate: true } : { dateUnknown: true }),
      tags: Array.from(new Set([...stringTags(record), marker])),
    },
  };
}

export function meaningfulProviderQueryTerms(query?: string): string[] {
  const words = Array.from(new Set(normalizedWords(query ?? "")));
  const meaningful = words.filter(
    (word) => word.length >= 2 && !GENERIC_QUERY_TERMS.has(word),
  );
  return meaningful.length > 0 ? meaningful : words;
}

export function isOccuMedProfileQuery(query?: string): boolean {
  return OCCUMED_PROFILE_QUERIES.has(normalizedWords(query ?? "").join(" "));
}

export function classifyProviderRecordRelevance(
  record: NormalizedOpportunity,
): RelevanceResult {
  return classifyResult({
    title: record.title,
    snippet: [
      record.type,
      record.solicitationNumber,
      record.description,
      record.agency,
      record.subAgency,
      record.naicsDescription,
    ]
      .filter(Boolean)
      .join(" "),
    url: record.sourceUrl,
    date: record.postedDate,
    deadlineInFuture: Boolean(
      record.responseDeadline && record.responseDeadline.getTime() > Date.now(),
    ),
    allowHistorical: true,
  });
}

function recordSearchText(record: NormalizedOpportunity): string {
  return normalizedWords(
    [
      record.title,
      record.type,
      record.agency,
      record.subAgency,
      record.description,
      record.solicitationNumber,
      record.naicsDescription,
    ]
      .filter(Boolean)
      .join(" "),
  ).join(" ");
}

export function recordMatchesProviderQuery(
  record: NormalizedOpportunity,
  query?: string,
): boolean {
  if (!query?.trim()) return true;
  if (isOccuMedProfileQuery(query)) {
    return !classifyProviderRecordRelevance(record).rejected;
  }

  const terms = meaningfulProviderQueryTerms(query);
  if (terms.length === 0) return true;
  const haystack = recordSearchText(record);
  return terms.every((term) => haystack.includes(term));
}

function mismatchSample(
  record: NormalizedOpportunity,
  query: string,
): NormalizedOpportunity {
  return {
    ...record,
    rawData: {
      ...(record.rawData ?? {}),
      manualQueryMismatch: true,
      manualQuery: query,
      tags: Array.from(
        new Set([...stringTags(record), "manual-query-mismatch"]),
      ),
    },
  };
}

export interface ProviderQueryPartition {
  matched: NormalizedOpportunity[];
  rejectedSamples: NormalizedOpportunity[];
  rawCount: number;
  matchedCount: number;
  rejectedCount: number;
}

export function partitionProviderRecordsForQuery(
  records: readonly NormalizedOpportunity[],
  query?: string,
  rejectionSampleLimit = 2,
): ProviderQueryPartition {
  const normalizedRecords = records.map(normalizeProviderPostedDate);
  if (!query?.trim()) {
    return {
      matched: normalizedRecords,
      rejectedSamples: [],
      rawCount: normalizedRecords.length,
      matchedCount: normalizedRecords.length,
      rejectedCount: 0,
    };
  }

  const matched: NormalizedOpportunity[] = [];
  const rejected: NormalizedOpportunity[] = [];
  for (const record of normalizedRecords) {
    if (recordMatchesProviderQuery(record, query)) matched.push(record);
    else rejected.push(record);
  }

  const sampleLimit = Math.max(0, Math.floor(rejectionSampleLimit));
  const rejectedSamples = rejected
    .slice()
    .sort(
      (left, right) =>
        left.title.localeCompare(right.title) ||
        left.externalId.localeCompare(right.externalId),
    )
    .slice(0, sampleLimit)
    .map((record) => mismatchSample(record, query));

  return {
    matched,
    rejectedSamples,
    rawCount: normalizedRecords.length,
    matchedCount: matched.length,
    rejectedCount: rejected.length,
  };
}

// Compatibility aliases for the existing ingestion regression suite.
export const meaningfulManualQueryTerms = meaningfulProviderQueryTerms;
export const recordMatchesManualQuery = recordMatchesProviderQuery;
export function filterRecordsForManualQuery(
  records: readonly NormalizedOpportunity[],
  query?: string,
): { records: NormalizedOpportunity[]; skipped: number } {
  const partition = partitionProviderRecordsForQuery(records, query, 0);
  return {
    records: partition.matched,
    skipped: partition.rejectedCount,
  };
}
