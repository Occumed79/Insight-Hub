import {
  fetchOfficialPortalText,
  positiveIntegerEnv,
} from "./officialPortalHttp";
import type { FetchOptions, NormalizedOpportunity } from "./types";

const BIDLOCKER_ORIGIN = "https://bidlocker.us";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_CONCURRENCY = 4;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS = new Map(
  [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].map((month, index) => [month, index]),
);

function parsePacificDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i,
  );
  if (!match) return undefined;

  const month = MONTHS.get(match[1].slice(0, 3).toLowerCase());
  if (month === undefined) return undefined;
  const day = Number(match[2]);
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour === 12) hour = 0;
  if (match[6].toUpperCase() === "PM") hour += 12;

  const offsetMinutes = /Pacific Standard Time/i.test(normalized)
    ? 8 * 60
    : 7 * 60;
  return new Date(
    Date.UTC(year, month, day, hour, minute) + offsetMinutes * 60_000,
  );
}

export interface BidLockerPublicDates {
  postedDate?: Date;
  responseDeadline?: Date;
}

export function extractBidLockerPublicDates(
  html: string,
): BidLockerPublicDates {
  const text = stripHtml(html);
  const dateValue =
    "([A-Za-z]{3,9}\\s+\\d{1,2},\\s+\\d{4}\\s+\\d{1,2}:\\d{2}\\s*(?:AM|PM)(?:\\s*\\([^)]*\\))?)";
  const posted = text.match(new RegExp(`Publish Date:\\s*${dateValue}`, "i"))?.[1];
  const deadline = text.match(
    new RegExp(
      `(?:Bids|Proposals|Responses|Quotes?|Offers?|Submissions?)\\s+Due Date:\\s*${dateValue}`,
      "i",
    ),
  )?.[1];

  return {
    postedDate: parsePacificDate(posted),
    responseDeadline: parsePacificDate(deadline),
  };
}

async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Math.min(Math.max(1, concurrency), Math.max(1, values.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        const value = values[index];
        if (value === undefined) return;
        await worker(value, index);
      }
    }),
  );
}

export async function enrichBidLockerRecordDates(
  records: readonly NormalizedOpportunity[],
  options: FetchOptions = {},
): Promise<{ records: NormalizedOpportunity[]; errors: string[] }> {
  const timeoutMs = positiveIntegerEnv(
    "BIDLOCKER_REQUEST_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
    3_000,
    60_000,
  );
  const maxRetries = positiveIntegerEnv(
    "BIDLOCKER_MAX_RETRIES",
    DEFAULT_MAX_RETRIES,
    0,
    3,
  );
  const concurrency = positiveIntegerEnv(
    "BIDLOCKER_DETAIL_CONCURRENCY",
    DEFAULT_CONCURRENCY,
    1,
    8,
  );
  const enriched = [...records];
  const errors: string[] = [];

  await runWithConcurrency(records, concurrency, async (record, index) => {
    const isBidLocker = record.rawData?.providerPlatform === "bidlocker";
    const needsPostedDate = record.postedDate.getTime() === 0;
    const needsDeadline = !record.responseDeadline;
    if (!isBidLocker || !record.sourceUrl || (!needsPostedDate && !needsDeadline)) {
      return;
    }

    try {
      const html = await fetchOfficialPortalText(record.sourceUrl, {
        label: `${String(record.rawData?.sourceId ?? "bidlocker")} date enrichment`,
        origin: BIDLOCKER_ORIGIN,
        timeoutMs,
        maxRetries,
        signal: options.signal,
      });
      const dates = extractBidLockerPublicDates(html);
      if (!dates.postedDate && !dates.responseDeadline) {
        throw new Error("public detail page did not expose recognizable publish or due dates");
      }

      enriched[index] = {
        ...record,
        postedDate: dates.postedDate ?? record.postedDate,
        responseDeadline: dates.responseDeadline ?? record.responseDeadline,
        rawData: {
          ...(record.rawData ?? {}),
          dateUnknown: !(dates.postedDate ?? (needsPostedDate ? undefined : record.postedDate)),
          deadlineUnknown: !(dates.responseDeadline ?? record.responseDeadline),
          dateEnrichment: "bidlocker_public_detail_labels",
        },
      };
    } catch (error) {
      errors.push(
        `${String(record.rawData?.sourceId ?? "bidlocker")}/${record.externalId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });

  return { records: enriched, errors };
}
