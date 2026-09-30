import type { NormalizedOpportunity } from "./types";

/**
 * Verification for SAM.gov opportunity pages recovered through web search.
 *
 * Search-engine hits carry no trustworthy metadata: the discovery pipeline used
 * to stamp undated hits with "now" as the posted date and a service-line label
 * as the agency. This module reads the page itself and keeps a record only when
 * the posted date and status are confirmed from it. Anything that cannot be
 * confirmed is dropped, never guessed.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_VERIFICATIONS_PER_RUN = 12;
const VERIFY_CONCURRENCY = 2;

export interface SamPageFacts {
  postedDate?: Date;
  responseDeadline?: Date;
  archiveDate?: Date;
  agency?: string;
  inactive: boolean;
}

export interface SamVerificationDrop {
  url: string;
  reason: string;
}

export interface SamVerificationResult {
  verified: NormalizedOpportunity[];
  dropped: SamVerificationDrop[];
}

export interface SamVerificationOptions {
  /** Look-back window in days. Records posted before this are dropped. */
  dateRangeDays: number;
  signal?: AbortSignal;
  now?: Date;
  /** Injectable for tests. Defaults to the Jina reader used elsewhere. */
  fetchText?: (url: string, signal?: AbortSignal) => Promise<string | null>;
}

const DATE_VALUE =
  String.raw`(\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4})`;

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/\.(?= \d)/, "");
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const year = parsed.getUTCFullYear();
  if (year < 2000 || year > 2100) return undefined;
  return parsed;
}

function labelledDate(text: string, labels: string[]): Date | undefined {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label}[^\\n\\d]{0,40}?[:\\-|*\\s]{0,6}${DATE_VALUE}`,
      "i",
    );
    const match = text.match(pattern);
    const parsed = parseDate(match?.[1]);
    if (parsed) return parsed;
  }
  return undefined;
}

/**
 * Pull facts out of the readable text of a sam.gov/opp/<id>/view page.
 * Missing facts stay undefined so the caller decides, rather than defaulting.
 */
export function parseSamPageFacts(text: string, now = new Date()): SamPageFacts {
  const postedDate = labelledDate(text, [
    "Original Published Date",
    "Published Date",
    "Date Published",
    "Posted Date",
    "Date Posted",
  ]);
  const responseDeadline = labelledDate(text, [
    "Current Date Offers Due",
    "Updated Date Offers Due",
    "Original Date Offers Due",
    "Date Offers Due",
    "Response Date",
    "Offers Due",
  ]);
  const archiveDate = labelledDate(text, [
    "Current Archive Date",
    "Original Archive Date",
    "Archive Date",
  ]);

  const agencyMatch = text.match(
    /(?:Department\/Ind\.? Agency|Dept\.?\/Ind\.? Agency)[\s:*|-]{1,8}([^\n|*]{3,120})/i,
  );
  const agency = agencyMatch?.[1]?.trim().replace(/\s+/g, " ");

  const statusInactive =
    /\b(?:notice\s+)?status\s*[:\-|*]\s*(?:inactive|archived|expired|cancell?ed)\b/i.test(text) ||
    /\bthis (?:opportunity|notice) (?:is|has been|was) (?:archived|inactive|expired|cancell?ed)\b/i.test(text);
  const archivedByDate = archiveDate ? archiveDate.getTime() < now.getTime() - DAY_MS : false;

  return {
    postedDate,
    responseDeadline,
    archiveDate,
    agency: agency && !/^(?:n\/a|none|unknown)$/i.test(agency) ? agency : undefined,
    inactive: statusInactive || archivedByDate,
  };
}

async function defaultFetchText(url: string, signal?: AbortSignal): Promise<string | null> {
  const { jinaProvider } = await import("./jina");
  return jinaProvider.extractUrl(url, 12_000, signal);
}

function withoutTags(tags: unknown, drop: string[]): string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  return tags.filter((tag): tag is string => typeof tag === "string" && !drop.includes(tag));
}

export async function verifySamPublicRecords(
  records: NormalizedOpportunity[],
  options: SamVerificationOptions,
): Promise<SamVerificationResult> {
  const now = options.now ?? new Date();
  const windowStart = new Date(now.getTime() - options.dateRangeDays * DAY_MS);
  const fetchText = options.fetchText ?? defaultFetchText;
  const verified: NormalizedOpportunity[] = [];
  const dropped: SamVerificationDrop[] = [];
  const queue: NormalizedOpportunity[] = [];

  for (const record of records) {
    const url = record.sourceUrl ?? record.externalId;
    // A search engine that did report a date outside the window is enough to
    // drop without spending a page fetch.
    const reportedDate = record.rawData?.dateUnknown === true ? null : record.postedDate;
    if (reportedDate && reportedDate.getTime() > 0 && reportedDate < windowStart) {
      dropped.push({ url, reason: "reported posted date is outside the date window" });
      continue;
    }
    if (queue.length >= MAX_VERIFICATIONS_PER_RUN) {
      dropped.push({ url, reason: "verification limit reached for this run" });
      continue;
    }
    queue.push(record);
  }

  for (let index = 0; index < queue.length; index += VERIFY_CONCURRENCY) {
    const batch = queue.slice(index, index + VERIFY_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (record): Promise<NormalizedOpportunity | SamVerificationDrop> => {
        const url = record.sourceUrl ?? record.externalId;
        let text: string | null = null;
        try {
          text = await fetchText(url, options.signal);
        } catch {
          text = null;
        }
        if (!text || text.trim().length < 200) {
          return { url, reason: "page could not be read" };
        }
        const facts = parseSamPageFacts(text, now);
        if (!facts.postedDate) return { url, reason: "posted date not found on page" };
        if (facts.postedDate < windowStart) {
          return { url, reason: "posted before the date window" };
        }
        if (facts.postedDate.getTime() > now.getTime() + DAY_MS) {
          return { url, reason: "posted date is in the future" };
        }
        if (facts.inactive) return { url, reason: "notice is archived or inactive" };
        if (facts.responseDeadline && facts.responseDeadline.getTime() < now.getTime() - DAY_MS) {
          return { url, reason: "response deadline has passed" };
        }
        const tags = withoutTags(record.rawData?.tags, ["date-unknown", "stale"]);
        return {
          ...record,
          agency: facts.agency ?? "Agency not stated on SAM.gov page",
          status: "active" as const,
          postedDate: facts.postedDate,
          responseDeadline: facts.responseDeadline,
          rawData: {
            ...(record.rawData ?? {}),
            ...(tags ? { tags } : {}),
            dateUnknown: false,
            stale: false,
            samPageVerified: true,
            samPageVerifiedAt: now.toISOString(),
            samPageDeadlineVerified: Boolean(facts.responseDeadline),
          },
        };
      }),
    );
    for (const outcome of outcomes) {
      if ("reason" in outcome) dropped.push(outcome);
      else verified.push(outcome);
    }
  }

  return { verified, dropped };
}

export function summarizeSamVerification(result: SamVerificationResult): string[] {
  if (result.dropped.length === 0) return [];
  const byReason = new Map<string, number>();
  for (const drop of result.dropped) {
    byReason.set(drop.reason, (byReason.get(drop.reason) ?? 0) + 1);
  }
  const detail = [...byReason.entries()].map(([reason, count]) => `${count} ${reason}`).join("; ");
  return [
    `SAM.gov public-page recovery dropped ${result.dropped.length} unverifiable result(s): ${detail}.`,
  ];
}
