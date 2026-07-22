import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import {
  extractSameOriginPaginationUrls,
  fetchOfficialPortalText,
  positiveIntegerEnv,
} from "./officialPortalHttp";

const NYSCR_SEARCH_URL = "https://www.nyscr.ny.gov/Ads/Search";
const NYSCR_ORIGIN = new URL(NYSCR_SEARCH_URL).origin;
const DEFAULT_LIMIT = 100;
const UNKNOWN_POSTED_DATE = new Date(0);

interface NyScrRow {
  title: string;
  crNumber: string;
  agency?: string;
  company?: string;
  division?: string;
  issueDate?: string;
  dueDate?: string;
  location?: string;
  category?: string;
  adType?: string;
  note?: string;
  detailDescription?: string;
  contact?: string;
  contractTerm?: string;
  sourceUrl: string;
  listingPageUrl: string;
  listingPageNumber: number;
  detailFetched?: boolean;
  detailRequiresLogin?: boolean;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fieldValue(blockText: string, label: string): string | undefined {
  const labels = [
    "Title",
    "Note",
    "CR#",
    "Agency",
    "Company",
    "Division",
    "Issue date",
    "Due date",
    "Location",
    "Category",
    "Ad type",
  ];
  const otherLabels = labels.filter((candidate) => candidate !== label).map(escapeRegex).join("|");
  const pattern = new RegExp(`${escapeRegex(label)}:\\s*([\\s\\S]*?)(?=\\s+(?:${otherLabels}):|\\s+Log in or sign up to view this opportunity|$)`, "i");
  const match = blockText.match(pattern);
  return match?.[1]?.replace(/^\|\s*/, "").trim() || undefined;
}

function detailFieldValue(blockText: string, labels: string[]): string | undefined {
  const allLabels = [
    "Description",
    "Overview",
    "Scope of Work",
    "Contract term",
    "Contract Term",
    "Primary Contact",
    "Contact",
    "Agency",
    "Division",
    "CR#",
    "Due date",
    "Location",
    "Category",
  ];
  for (const label of labels) {
    const otherLabels = allLabels.filter((candidate) => candidate !== label).map(escapeRegex).join("|");
    const pattern = new RegExp(`${escapeRegex(label)}:\\s*([\\s\\S]*?)(?=\\s+(?:${otherLabels}):|$)`, "i");
    const match = blockText.match(pattern);
    const value = match?.[1]?.replace(/^\|\s*/, "").trim();
    if (value) return value.slice(0, 4_000);
  }
  return undefined;
}

function parseNyDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizedComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findPublicDetailUrl(
  html: string,
  pageUrl: string,
  crNumber: string,
  title: string,
): string | undefined {
  const crKey = normalizedComparable(crNumber);
  const titleKey = normalizedComparable(title).slice(0, 48);
  const anchors = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));

  for (const anchor of anchors) {
    let url: URL;
    try {
      url = new URL(anchor[1], pageUrl);
    } catch {
      continue;
    }
    if (url.origin !== NYSCR_ORIGIN || url.pathname.toLowerCase() === "/ads/search") continue;
    const text = stripTags(anchor[2] ?? "");
    const comparison = normalizedComparable(`${decodeURIComponent(url.toString())} ${text}`);
    const looksLikeDetail = /\/ads\/(?:details?|view|show|opportunity)/i.test(url.pathname);
    if ((crKey && comparison.includes(crKey)) || (looksLikeDetail && titleKey && comparison.includes(titleKey))) {
      url.hash = "";
      return url.toString();
    }
  }
  return undefined;
}

function parseNyScrRows(html: string, listingPageUrl: string, listingPageNumber: number): NyScrRow[] {
  const text = stripTags(html);
  const rowMatches = Array.from(text.matchAll(/(?:^|\s)(\d{1,3})\s+Title:\s+/g));
  const rows: NyScrRow[] = [];

  for (let index = 0; index < rowMatches.length; index += 1) {
    const start = rowMatches[index].index ?? 0;
    const nextStart = rowMatches[index + 1]?.index ?? text.length;
    const blockText = text.slice(start, nextStart).trim();

    const title = fieldValue(blockText, "Title");
    const crNumber = fieldValue(blockText, "CR#");
    if (!title || !crNumber) continue;

    const detailUrl = findPublicDetailUrl(html, listingPageUrl, crNumber, title);
    rows.push({
      title,
      crNumber,
      agency: fieldValue(blockText, "Agency"),
      company: fieldValue(blockText, "Company"),
      division: fieldValue(blockText, "Division"),
      issueDate: fieldValue(blockText, "Issue date"),
      dueDate: fieldValue(blockText, "Due date"),
      location: fieldValue(blockText, "Location"),
      category: fieldValue(blockText, "Category"),
      adType: fieldValue(blockText, "Ad type"),
      note: fieldValue(blockText, "Note"),
      sourceUrl: detailUrl ?? `${NYSCR_SEARCH_URL}#cr-${encodeURIComponent(crNumber)}`,
      listingPageUrl,
      listingPageNumber,
      detailRequiresLogin: !detailUrl,
    });
  }

  return rows;
}

function rowToOpportunity(row: NyScrRow): NormalizedOpportunity | null {
  const responseDeadline = parseNyDate(row.dueDate);
  if (responseDeadline && responseDeadline < new Date()) return null;

  const parsedPostedDate = parseNyDate(row.issueDate);
  const postedDate = parsedPostedDate ?? UNKNOWN_POSTED_DATE;
  const agency = row.agency ?? row.company ?? "New York State Contract Reporter";

  return {
    externalId: `ny-scr-${row.crNumber}`,
    title: row.title,
    agency,
    subAgency: row.division,
    type: row.adType ?? "Solicitation",
    status: "active",
    postedDate,
    responseDeadline,
    placeOfPerformance: row.location,
    solicitationNumber: row.crNumber,
    sourceUrl: row.sourceUrl,
    description: [
      row.detailDescription,
      row.title,
      row.note ? `Note: ${row.note}` : null,
      `CR#: ${row.crNumber}`,
      row.agency ? `Agency: ${row.agency}` : null,
      row.company ? `Company: ${row.company}` : null,
      row.division ? `Division: ${row.division}` : null,
      row.issueDate ? `Issue date: ${row.issueDate}` : null,
      row.dueDate ? `Due date: ${row.dueDate}` : null,
      row.location ? `Location: ${row.location}` : null,
      row.category ? `Category: ${row.category}` : null,
      row.adType ? `Ad type: ${row.adType}` : null,
      row.contractTerm ? `Contract term: ${row.contractTerm}` : null,
      row.contact ? `Contact: ${row.contact}` : null,
      row.detailRequiresLogin ? "Detailed ad view may require a free NYSCR account." : null,
    ].filter(Boolean).join("\n"),
    source: "nyScr",
    providerName: "nyScr",
    rawData: {
      providerName: "ny_scr_direct_parser",
      providerFamily: "official_state_portal",
      discoveryMethod: "direct_official_listing",
      portalName: "New York State Contract Reporter",
      portalState: "NY",
      sourceId: "ny-contract-reporter",
      sourceConfidence: "high",
      dateUnknown: !parsedPostedDate,
      listingPageUrl: row.listingPageUrl,
      listingPageNumber: row.listingPageNumber,
      detailFetched: row.detailFetched === true,
      detailRequiresLogin: row.detailRequiresLogin === true,
      paginationMode: "bounded_same_origin",
      tags: [
        "direct-official-portal",
        "state:NY",
        "ny-scr",
        "parser:ny-scr",
        ...(!parsedPostedDate ? ["date-unknown"] : []),
        ...(row.detailFetched ? ["detail-enriched"] : []),
        ...(row.detailRequiresLogin ? ["detail-login-may-be-required"] : []),
      ],
      notes: row.detailFetched
        ? "Parsed from the official NYSCR public listing and enriched from a public detail page."
        : "Parsed from the official NYSCR public open-opportunity listing. Detailed ad view may require a free account.",
      nyScr: row,
    },
  };
}

async function enrichNyScrRow(
  row: NyScrRow,
  timeoutMs: number,
  maxRetries: number,
  signal?: AbortSignal,
): Promise<NyScrRow> {
  if (row.detailRequiresLogin || row.sourceUrl.includes("#")) return row;
  const html = await fetchOfficialPortalText(row.sourceUrl, {
    label: `NYSCR detail ${row.crNumber}`,
    origin: NYSCR_ORIGIN,
    timeoutMs,
    maxRetries,
    signal,
  });
  const text = stripTags(html);
  if (/log in|sign up to view this opportunity/i.test(text) && !/description:\s*\S/i.test(text)) {
    return { ...row, detailRequiresLogin: true };
  }
  return {
    ...row,
    detailDescription: detailFieldValue(text, ["Description", "Overview", "Scope of Work"]),
    contact: detailFieldValue(text, ["Primary Contact", "Contact"]),
    contractTerm: detailFieldValue(text, ["Contract term", "Contract Term"]),
    detailFetched: true,
    detailRequiresLogin: false,
  };
}

export class NyScrProvider implements DataSourceProvider {
  readonly name = "nyScr" as const;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 500);
    const maxPages = positiveIntegerEnv("NYSCR_MAX_PAGES", 5, 1, 25);
    const detailLimit = positiveIntegerEnv("NYSCR_DETAIL_LIMIT", 25, 0, 100);
    const timeoutMs = positiveIntegerEnv("NYSCR_REQUEST_TIMEOUT_MS", 15_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("NYSCR_MAX_RETRIES", 2, 0, 5);

    const queue = [NYSCR_SEARCH_URL];
    const seenPages = new Set<string>();
    const seenCrNumbers = new Set<string>();
    const rows: NyScrRow[] = [];
    const errors: string[] = [];
    let pageNumber = 0;

    while (queue.length > 0 && pageNumber < maxPages && rows.length < limit) {
      const pageUrl = queue.shift();
      if (!pageUrl) break;
      const pageKey = pageUrl.toLowerCase().replace(/#.*$/, "");
      if (seenPages.has(pageKey)) continue;
      seenPages.add(pageKey);

      let html: string;
      try {
        html = await fetchOfficialPortalText(pageUrl, {
          label: `NYSCR listing page ${pageNumber + 1}`,
          origin: NYSCR_ORIGIN,
          timeoutMs,
          maxRetries,
          signal: options.signal,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        if (rows.length === 0) return { records: [], total: 0, errors };
        break;
      }

      pageNumber += 1;
      for (const row of parseNyScrRows(html, pageUrl, pageNumber)) {
        const key = row.crNumber.toLowerCase();
        if (seenCrNumbers.has(key)) continue;
        seenCrNumbers.add(key);
        rows.push(row);
        if (rows.length >= limit) break;
      }

      if (pageNumber >= maxPages || rows.length >= limit) continue;
      for (const nextUrl of extractSameOriginPaginationUrls(html, pageUrl, NYSCR_ORIGIN, maxPages * 3)) {
        const key = nextUrl.toLowerCase().replace(/#.*$/, "");
        if (!seenPages.has(key) && !queue.some((queued) => queued.toLowerCase().replace(/#.*$/, "") === key)) {
          queue.push(nextUrl);
        }
      }
    }

    const enrichedRows: NyScrRow[] = [];
    let attemptedDetails = 0;
    for (const row of rows) {
      if (attemptedDetails >= detailLimit || row.detailRequiresLogin || row.sourceUrl.includes("#")) {
        enrichedRows.push(row);
        continue;
      }
      attemptedDetails += 1;
      try {
        enrichedRows.push(await enrichNyScrRow(row, timeoutMs, maxRetries, options.signal));
      } catch (error) {
        errors.push(`NYSCR detail ${row.crNumber}: ${error instanceof Error ? error.message : String(error)}`);
        enrichedRows.push(row);
      }
    }

    const records = enrichedRows
      .map(rowToOpportunity)
      .filter((record): record is NormalizedOpportunity => Boolean(record));

    if (pageNumber >= maxPages && queue.length > 0) {
      errors.push(`NYSCR pagination stopped at the configured ${maxPages}-page cap.`);
    }
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: "nyScr",
      configured: true,
      healthy: true,
    };
  }
}

export const nyScrProvider = new NyScrProvider();
