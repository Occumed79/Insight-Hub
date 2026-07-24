import type { NormalizedOpportunity } from "../providers/types";
import { decideOpportunityQuality } from "./opportunityIdentity";

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

export function meaningfulManualQueryTerms(query?: string): string[] {
  const words = Array.from(new Set(normalizedWords(query ?? "")));
  const meaningful = words.filter(
    (word) => word.length >= 2 && !GENERIC_QUERY_TERMS.has(word),
  );
  return meaningful.length > 0 ? meaningful : words;
}

export function isOccuMedProfileQuery(query?: string): boolean {
  return OCCUMED_PROFILE_QUERIES.has(normalizedWords(query ?? "").join(" "));
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

export function recordMatchesManualQuery(
  record: NormalizedOpportunity,
  query?: string,
): boolean {
  if (!query?.trim()) return true;

  // The portal's default query represents the complete Occu-Med service
  // profile, not a literal three-word search. Apply the same final quality
  // decision here so generic words such as "services" cannot flood staging.
  if (isOccuMedProfileQuery(query)) {
    return decideOpportunityQuality(record).status === "accepted";
  }

  const terms = meaningfulManualQueryTerms(query);
  if (terms.length === 0) return true;
  const haystack = recordSearchText(record);
  return terms.every((term) => haystack.includes(term));
}

export function filterRecordsForManualQuery(
  records: readonly NormalizedOpportunity[],
  query?: string,
): { records: NormalizedOpportunity[]; skipped: number } {
  if (!query?.trim()) return { records: [...records], skipped: 0 };
  const filtered = records.filter((record) => recordMatchesManualQuery(record, query));
  return { records: filtered, skipped: records.length - filtered.length };
}
