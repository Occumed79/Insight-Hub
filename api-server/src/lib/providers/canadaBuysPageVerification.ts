import type { NormalizedOpportunity } from "./types";
import type {
  SamVerificationDrop,
  SamVerificationResult,
} from "./samGovPageVerification";

/**
 * Verification for CanadaBuys tender pages recovered through web search.
 *
 * Search hits carry no trustworthy metadata: the discovery pipeline stamped
 * undated hits with "now" as the posted date and a service-line label as the
 * agency. This reads the notice page itself and keeps a record only when the
 * tender is confirmed open (future closing date, not cancelled/awarded). When
 * the page states no publication date, the posted date stays honestly unknown
 * (epoch sentinel + dateUnknown) instead of being invented.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_VERIFICATIONS_PER_RUN = 12;
const VERIFY_CONCURRENCY = 2;
const UNKNOWN_POSTED_DATE = new Date(0);

export interface CanadaBuysPageFacts {
  publicationDate?: Date;
  closingDate?: Date;
  agency?: string;
  closedOrCancelled: boolean;
}

export interface CanadaBuysVerificationOptions {
  dateRangeDays: number;
  signal?: AbortSignal;
  now?: Date;
  fetchText?: (url: string, signal?: AbortSignal) => Promise<string | null>;
}

// CanadaBuys prints dates as 2026/10/20 (sometimes 2026-10-20) with an
// optional time afterwards; only the date part is used.
const DATE_VALUE = String.raw`(\d{4}[\/-]\d{2}[\/-]\d{2}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4})`;

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const parsed = new Date(raw.trim().replace(/\.(?= \d)/, "").replace(/\//g, "-"));
  if (Number.isNaN(parsed.getTime())) return undefined;
  const year = parsed.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? parsed : undefined;
}

function labelledDate(text: string, labels: string[]): Date | undefined {
  for (const label of labels) {
    const match = text.match(
      new RegExp(`${label}[^\\n\\d]{0,30}?[:\\-|*\\s]{0,6}${DATE_VALUE}`, "i"),
    );
    const parsed = parseDate(match?.[1]);
    if (parsed) return parsed;
  }
  return undefined;
}

export function parseCanadaBuysPageFacts(text: string): CanadaBuysPageFacts {
  const publicationDate = labelledDate(text, [
    "Publication date",
    "Date published",
    "Published",
  ]);
  const closingDate = labelledDate(text, [
    "Closing date and time",
    "Closing date",
    "Solicitation closing date",
  ]);
  const agencyMatch = text.match(
    /(?:Contracting entity|Procuring entity|Procurement entity|Organization)[\s:*|-]{1,8}([^\n|*]{3,120})/i,
  );
  const agency = agencyMatch?.[1]?.trim().replace(/\s+/g, " ");
  const closedOrCancelled =
    /\b(?:tender\s+)?status\s*[:\-|*]\s*(?:cancell?ed|closed|expired|awarded)\b/i.test(text) ||
    /\b(?:this|the) tender (?:has been|was|is) (?:cancell?ed|closed|awarded)\b/i.test(text);
  return {
    publicationDate,
    closingDate,
    agency: agency && !/^(?:n\/a|none|unknown)$/i.test(agency) ? agency : undefined,
    closedOrCancelled,
  };
}

async function defaultFetchText(url: string, signal?: AbortSignal): Promise<string | null> {
  const { jinaProvider } = await import("./jina");
  return jinaProvider.extractUrl(url, 12_000, signal);
}

export async function verifyCanadaBuysRecords(
  records: NormalizedOpportunity[],
  options: CanadaBuysVerificationOptions,
): Promise<SamVerificationResult> {
  const now = options.now ?? new Date();
  const windowStart = new Date(now.getTime() - options.dateRangeDays * DAY_MS);
  const fetchText = options.fetchText ?? defaultFetchText;
  const verified: NormalizedOpportunity[] = [];
  const dropped: SamVerificationDrop[] = [];
  const queue = records.slice(0, MAX_VERIFICATIONS_PER_RUN);
  for (const extra of records.slice(MAX_VERIFICATIONS_PER_RUN)) {
    dropped.push({ url: extra.sourceUrl ?? extra.externalId, reason: "verification limit reached for this run" });
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
        if (!text || text.trim().length < 200) return { url, reason: "page could not be read" };
        const facts = parseCanadaBuysPageFacts(text);
        if (facts.closedOrCancelled) return { url, reason: "tender is closed, cancelled or awarded" };
        if (!facts.closingDate) return { url, reason: "closing date not found on page" };
        if (facts.closingDate.getTime() < now.getTime() - DAY_MS) {
          return { url, reason: "closing date has passed" };
        }
        if (facts.publicationDate && facts.publicationDate < windowStart) {
          return { url, reason: "published before the date window" };
        }
        if (facts.publicationDate && facts.publicationDate.getTime() > now.getTime() + DAY_MS) {
          return { url, reason: "publication date is in the future" };
        }
        const tags = Array.isArray(record.rawData?.tags)
          ? (record.rawData!.tags as unknown[]).filter(
              (tag): tag is string => typeof tag === "string" && tag !== "date-unknown" && tag !== "stale",
            )
          : [];
        if (!facts.publicationDate) tags.push("date-unknown");
        return {
          ...record,
          agency: facts.agency ?? "Agency not stated on CanadaBuys page",
          status: "active" as const,
          postedDate: facts.publicationDate ?? UNKNOWN_POSTED_DATE,
          responseDeadline: facts.closingDate,
          rawData: {
            ...(record.rawData ?? {}),
            tags,
            dateUnknown: !facts.publicationDate,
            stale: false,
            pageVerified: true,
            pageVerifiedAt: now.toISOString(),
            deadlineProvenance: "official_page",
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
