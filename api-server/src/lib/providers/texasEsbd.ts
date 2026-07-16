import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import {
  extractSameOriginPaginationUrls,
  fetchOfficialPortalText,
  positiveIntegerEnv,
} from "./officialPortalHttp";

const ESBD_URL = "https://www.txsmartbuy.gov/esbd";
const ESBD_BASE_URL = "https://www.txsmartbuy.gov";
const ESBD_ORIGIN = new URL(ESBD_BASE_URL).origin;
const DEFAULT_LIMIT = 100;
const UNKNOWN_POSTED_DATE = new Date(0);

const ACTIVE_STATUSES = new Set(["posted", "addendum posted", "pre-solicitation", "presolicitation"]);

interface TexasEsbdRow {
  title: string;
  solicitationId: string;
  dueDate?: string;
  dueTime?: string;
  agencyMemberNumber?: string;
  agencyName?: string;
  status?: string;
  postingDate?: string;
  createdDate?: string;
  lastUpdated?: string;
  detailDescription?: string;
  contact?: string;
  commodity?: string;
  sourceUrl: string;
  listingPageUrl: string;
  listingPageNumber: number;
  detailFetched?: boolean;
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
    "Solicitation ID",
    "Due Date",
    "Due Time",
    "Agency/Texas SmartBuy Member Number",
    "Status",
    "Posting Date",
    "Created Date",
    "Last Updated",
  ];
  const otherLabels = labels.filter((candidate) => candidate !== label).map(escapeRegex).join("|");
  const pattern = new RegExp(`${escapeRegex(label)}:\\s*([\\s\\S]*?)(?=\\s+(?:${otherLabels}):|$)`, "i");
  const match = blockText.match(pattern);
  return match?.[1]?.replace(/^\|\s*/, "").trim() || undefined;
}

function detailFieldValue(blockText: string, labels: string[]): string | undefined {
  const allLabels = [
    "Description",
    "Solicitation Description",
    "Scope of Work",
    "Agency Name",
    "Agency",
    "Contact Name",
    "Contact",
    "NIGP Class-Item",
    "NIGP Code",
    "Commodity",
    "Solicitation ID",
    "Due Date",
    "Status",
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

function parseTexasDate(dateValue?: string, timeValue?: string): Date | undefined {
  if (!dateValue) return undefined;
  const cleanedDate = dateValue.trim();
  const cleanedTime = timeValue?.trim();
  const candidate = cleanedTime ? `${cleanedDate} ${cleanedTime}` : cleanedDate;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseEsbdRows(html: string, listingPageUrl: string, listingPageNumber: number): TexasEsbdRow[] {
  const anchors = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']*\/esbd\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const rows: TexasEsbdRow[] = [];

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const href = anchor[1];
    const title = stripTags(anchor[2]);
    if (!title || /^(\d+|\.\.\.)$/.test(title)) continue;

    const start = anchor.index ?? 0;
    const nextStart = anchors[index + 1]?.index ?? html.length;
    const blockHtml = html.slice(start, nextStart);
    const blockText = stripTags(blockHtml);
    const solicitationId = fieldValue(blockText, "Solicitation ID");
    if (!solicitationId) continue;

    let sourceUrl: string;
    try {
      sourceUrl = new URL(href, ESBD_URL).toString();
    } catch {
      continue;
    }
    if (new URL(sourceUrl).origin !== ESBD_ORIGIN) continue;

    rows.push({
      title,
      solicitationId,
      dueDate: fieldValue(blockText, "Due Date"),
      dueTime: fieldValue(blockText, "Due Time"),
      agencyMemberNumber: fieldValue(blockText, "Agency/Texas SmartBuy Member Number"),
      status: fieldValue(blockText, "Status"),
      postingDate: fieldValue(blockText, "Posting Date"),
      createdDate: fieldValue(blockText, "Created Date"),
      lastUpdated: fieldValue(blockText, "Last Updated"),
      sourceUrl,
      listingPageUrl,
      listingPageNumber,
    });
  }

  return rows;
}

function rowToOpportunity(row: TexasEsbdRow): NormalizedOpportunity | null {
  const normalizedStatus = row.status?.toLowerCase().trim() ?? "";
  if (normalizedStatus && !ACTIVE_STATUSES.has(normalizedStatus)) return null;

  const responseDeadline = parseTexasDate(row.dueDate, row.dueTime);
  if (responseDeadline && responseDeadline < new Date()) return null;

  const parsedPostedDate = parseTexasDate(row.postingDate) ?? parseTexasDate(row.createdDate);
  const postedDate = parsedPostedDate ?? UNKNOWN_POSTED_DATE;
  const agency = row.agencyName
    ?? (row.agencyMemberNumber ? `Texas SmartBuy Member ${row.agencyMemberNumber}` : "Texas SmartBuy Member");

  return {
    externalId: `tx-esbd-${row.solicitationId}`,
    title: row.title,
    agency,
    type: "Solicitation",
    status: "active",
    postedDate,
    responseDeadline,
    solicitationNumber: row.solicitationId,
    sourceUrl: row.sourceUrl,
    description: [
      row.detailDescription,
      row.title,
      `Solicitation ID: ${row.solicitationId}`,
      row.status ? `Status: ${row.status}` : null,
      row.dueDate ? `Due Date: ${row.dueDate}${row.dueTime ? ` ${row.dueTime}` : ""}` : null,
      row.postingDate ? `Posting Date: ${row.postingDate}` : null,
      row.agencyName ? `Agency: ${row.agencyName}` : null,
      row.agencyMemberNumber ? `Agency/Texas SmartBuy Member Number: ${row.agencyMemberNumber}` : null,
      row.contact ? `Contact: ${row.contact}` : null,
      row.commodity ? `Commodity: ${row.commodity}` : null,
    ].filter(Boolean).join("\n"),
    source: "texasEsbd",
    providerName: "texasEsbd",
    rawData: {
      providerName: "texas_esbd_direct_parser",
      providerFamily: "official_state_portal",
      discoveryMethod: "direct_official_listing",
      portalName: "Texas ESBD / Texas SmartBuy",
      portalState: "TX",
      sourceId: "tx-esbd",
      sourceConfidence: "high",
      dateUnknown: !parsedPostedDate,
      listingPageUrl: row.listingPageUrl,
      listingPageNumber: row.listingPageNumber,
      detailFetched: row.detailFetched === true,
      paginationMode: "bounded_same_origin",
      tags: [
        "direct-official-portal",
        "state:TX",
        "texas-esbd",
        "parser:texas-esbd",
        ...(!parsedPostedDate ? ["date-unknown"] : []),
        ...(row.detailFetched ? ["detail-enriched"] : []),
      ],
      notes: row.detailFetched
        ? "Parsed from the official Texas ESBD listing and enriched from the public solicitation detail page."
        : "Parsed directly from the official Texas ESBD / Texas SmartBuy solicitation listing.",
      texasEsbd: row,
    },
  };
}

async function enrichTexasRow(
  row: TexasEsbdRow,
  timeoutMs: number,
  maxRetries: number,
): Promise<TexasEsbdRow> {
  const html = await fetchOfficialPortalText(row.sourceUrl, {
    label: `Texas ESBD detail ${row.solicitationId}`,
    origin: ESBD_ORIGIN,
    timeoutMs,
    maxRetries,
  });
  const text = stripTags(html);
  return {
    ...row,
    agencyName: detailFieldValue(text, ["Agency Name", "Agency"]),
    detailDescription: detailFieldValue(text, ["Solicitation Description", "Description", "Scope of Work"]),
    contact: detailFieldValue(text, ["Contact Name", "Contact"]),
    commodity: detailFieldValue(text, ["NIGP Class-Item", "NIGP Code", "Commodity"]),
    detailFetched: true,
  };
}

export class TexasEsbdProvider implements DataSourceProvider {
  readonly name = "texasEsbd" as const;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 500);
    const maxPages = positiveIntegerEnv("TEXAS_ESBD_MAX_PAGES", 5, 1, 25);
    const detailLimit = positiveIntegerEnv("TEXAS_ESBD_DETAIL_LIMIT", 25, 0, 100);
    const timeoutMs = positiveIntegerEnv("TEXAS_ESBD_REQUEST_TIMEOUT_MS", 15_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("TEXAS_ESBD_MAX_RETRIES", 2, 0, 5);

    const queue = [ESBD_URL];
    const seenPages = new Set<string>();
    const seenSolicitations = new Set<string>();
    const rows: TexasEsbdRow[] = [];
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
          label: `Texas ESBD listing page ${pageNumber + 1}`,
          origin: ESBD_ORIGIN,
          timeoutMs,
          maxRetries,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        if (rows.length === 0) return { records: [], total: 0, errors };
        break;
      }

      pageNumber += 1;
      for (const row of parseEsbdRows(html, pageUrl, pageNumber)) {
        const key = row.solicitationId.toLowerCase();
        if (seenSolicitations.has(key)) continue;
        seenSolicitations.add(key);
        rows.push(row);
        if (rows.length >= limit) break;
      }

      if (pageNumber >= maxPages || rows.length >= limit) continue;
      for (const nextUrl of extractSameOriginPaginationUrls(html, pageUrl, ESBD_ORIGIN, maxPages * 3)) {
        const key = nextUrl.toLowerCase().replace(/#.*$/, "");
        if (!seenPages.has(key) && !queue.some((queued) => queued.toLowerCase().replace(/#.*$/, "") === key)) {
          queue.push(nextUrl);
        }
      }
    }

    const enrichedRows: TexasEsbdRow[] = [];
    for (const [index, row] of rows.entries()) {
      if (index >= detailLimit) {
        enrichedRows.push(row);
        continue;
      }
      try {
        enrichedRows.push(await enrichTexasRow(row, timeoutMs, maxRetries));
      } catch (error) {
        errors.push(`Texas ESBD detail ${row.solicitationId}: ${error instanceof Error ? error.message : String(error)}`);
        enrichedRows.push(row);
      }
    }

    const records = enrichedRows
      .map(rowToOpportunity)
      .filter((record): record is NormalizedOpportunity => Boolean(record));

    if (pageNumber >= maxPages && queue.length > 0) {
      errors.push(`Texas ESBD pagination stopped at the configured ${maxPages}-page cap.`);
    }
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: "texasEsbd",
      configured: true,
      healthy: true,
    };
  }
}

export const texasEsbdProvider = new TexasEsbdProvider();
