import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  extractSameOriginPaginationUrls,
  fetchOfficialPortalText,
  positiveIntegerEnv,
} from "./officialPortalHttp";

const UNKNOWN_POSTED_DATE = new Date(0);
const ACTIVE_STATUSES = new Set(["approved", "open", "opened", "sent"]);
const INACTIVE_STATUSES = new Set(["closed", "evaluated", "awarded", "cancelled", "canceled"]);
const STATUS_VALUES = new Set([...ACTIVE_STATUSES, ...INACTIVE_STATUSES, "intent to award", "bid to po"]);
const DATE_PATTERN = /\b\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?/i;

export interface BsoPortalConfig {
  sourceId: string;
  portalName: string;
  state: string;
  agencyName: string;
  baseUrl: string;
  listingUrl: string;
  envPrefix: string;
}

interface BsoListingRow {
  solicitationId: string;
  agency: string;
  buyer?: string;
  description: string;
  responseDeadline?: Date;
  statusText?: string;
  alternateId?: string;
  sourceUrl: string;
  listingPageUrl: string;
  listingPageNumber: number;
  postedDate?: Date;
  department?: string;
  location?: string;
  infoContact?: string;
  bidType?: string;
  purchaseMethod?: string;
  bulletinDescription?: string;
  attachmentNames?: string[];
  attachmentUrls?: string[];
  detailFetched?: boolean;
}

const DETAIL_LABELS = [
  "Bid Number",
  "Description",
  "Bid Opening Date",
  "Purchaser",
  "Organization",
  "Department",
  "Location",
  "Fiscal Year",
  "Type Code",
  "Allow Electronic Quote",
  "Alternate Id",
  "Required Date",
  "Available Date",
  "Info Contact",
  "Bid Type",
  "Informal Bid Flag",
  "Purchase Method",
  "Begin Date",
  "End Date",
  "Pre Bid Conference",
  "Bulletin Desc",
  "Ship-to Address",
  "Bill-to Address",
  "Print Format",
  "File Attachments",
  "Form Attachments",
  "Item Information",
];

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
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

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const match = value.match(DATE_PATTERN);
  if (!match) return undefined;
  const parsed = new Date(match[0]);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function fieldValue(text: string, label: string): string | undefined {
  const otherLabels = DETAIL_LABELS
    .filter((candidate) => candidate !== label)
    .map(escapeRegex)
    .join("|");
  const match = text.match(
    new RegExp(`${escapeRegex(label)}\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:${otherLabels})\\s*:|$)`, "i"),
  );
  const value = match?.[1]?.trim();
  return value || undefined;
}

function normalizeCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isNoiseCell(value: string): boolean {
  const normalized = value.toLowerCase();
  return !normalized
    || normalized === "view list"
    || normalized === "bid holder list"
    || normalized === "awarded vendor(s)"
    || normalized === "awarded vendors";
}

function absoluteSameOriginUrl(value: string, baseUrl: string, origin: string): string | undefined {
  try {
    const parsed = new URL(decodeHtml(value), baseUrl);
    if (parsed.origin !== origin) return undefined;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function extractTotalCount(html: string): number | undefined {
  const text = stripTags(html);
  const match = text.match(/\b\d+\s*-\s*\d+\s+of\s+([\d,]+)/i);
  if (!match) return undefined;
  const value = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(value) ? value : undefined;
}

function parseListingRows(
  html: string,
  config: BsoPortalConfig,
  listingPageUrl: string,
  listingPageNumber: number,
): BsoListingRow[] {
  const origin = new URL(config.baseUrl).origin;
  const tableRows = Array.from(html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi));
  const records: BsoListingRow[] = [];

  for (const rowMatch of tableRows) {
    const rowHtml = rowMatch[0];
    const detailAnchor = rowHtml.match(
      /<a\b[^>]*href=["']([^"']*\/external\/bidDetail\.sda\?[^"']*docId=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!detailAnchor) continue;

    const sourceUrl = absoluteSameOriginUrl(detailAnchor[1], listingPageUrl, origin);
    if (!sourceUrl) continue;

    const url = new URL(sourceUrl);
    const solicitationId = decodeHtml(url.searchParams.get("docId") ?? stripTags(detailAnchor[2]));
    if (!solicitationId) continue;

    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi))
      .map((cell) => normalizeCell(stripTags(cell[1])))
      .filter((cell) => !isNoiseCell(cell));
    if (cells.length === 0) continue;

    const deadlineIndex = cells.findIndex((cell) => DATE_PATTERN.test(cell));
    const responseDeadline = deadlineIndex >= 0 ? parseDate(cells[deadlineIndex]) : undefined;
    const beforeDeadline = (deadlineIndex >= 0 ? cells.slice(0, deadlineIndex) : cells)
      .filter((cell) => cell.toLowerCase() !== solicitationId.toLowerCase())
      .filter((cell) => !/^bid solicitation #$/i.test(cell));
    const afterDeadline = deadlineIndex >= 0 ? cells.slice(deadlineIndex + 1) : [];

    const statusIndex = afterDeadline.findIndex((cell) => STATUS_VALUES.has(cell.toLowerCase()));
    const statusText = statusIndex >= 0 ? afterDeadline[statusIndex] : undefined;
    const alternateId = statusIndex >= 0
      ? afterDeadline.slice(statusIndex + 1).find((cell) => !isNoiseCell(cell))
      : undefined;

    const description = beforeDeadline.at(-1) ?? stripTags(detailAnchor[2]);
    const buyer = beforeDeadline.length >= 2 ? beforeDeadline.at(-2) : undefined;
    const agency = beforeDeadline.length >= 3 ? beforeDeadline.at(-3) ?? config.agencyName : config.agencyName;
    if (!description || description.toLowerCase() === solicitationId.toLowerCase()) continue;

    records.push({
      solicitationId,
      agency,
      buyer,
      description,
      responseDeadline,
      statusText,
      alternateId,
      sourceUrl,
      listingPageUrl,
      listingPageNumber,
    });
  }

  return records;
}

function extractAttachments(html: string, detailUrl: string, origin: string): {
  names: string[];
  urls: string[];
} {
  const names = new Set<string>();
  const urls = new Set<string>();
  const anchors = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));

  for (const anchor of anchors) {
    const href = decodeHtml(anchor[1]);
    const label = stripTags(anchor[2]);
    const looksLikeFile = /\.(?:pdf|docx?|xlsx?|csv|txt|zip)(?:$|[?#])/i.test(href)
      || /\.(?:pdf|docx?|xlsx?|csv|txt|zip)$/i.test(label)
      || /(?:download|attachment|file)/i.test(href);
    if (!looksLikeFile) continue;
    const absolute = absoluteSameOriginUrl(href, detailUrl, origin);
    if (absolute) urls.add(absolute);
    if (label && label.length <= 300) names.add(label);
  }

  const text = stripTags(html);
  const fileSection = fieldValue(text, "File Attachments");
  if (fileSection) {
    for (const match of fileSection.matchAll(/[^\s][^\n]{0,240}?\.(?:pdf|docx?|xlsx?|csv|txt|zip)\b/gi)) {
      names.add(match[0].trim());
    }
  }

  return { names: Array.from(names), urls: Array.from(urls) };
}

async function enrichRow(
  row: BsoListingRow,
  config: BsoPortalConfig,
  timeoutMs: number,
  maxRetries: number,
): Promise<BsoListingRow> {
  const origin = new URL(config.baseUrl).origin;
  const html = await fetchOfficialPortalText(row.sourceUrl, {
    label: `${config.portalName} detail ${row.solicitationId}`,
    origin,
    timeoutMs,
    maxRetries,
  });
  const text = stripTags(html);
  const attachments = extractAttachments(html, row.sourceUrl, origin);

  return {
    ...row,
    agency: fieldValue(text, "Organization") ?? row.agency,
    buyer: fieldValue(text, "Purchaser") ?? row.buyer,
    description: fieldValue(text, "Description") ?? row.description,
    responseDeadline: parseDate(fieldValue(text, "Bid Opening Date")) ?? row.responseDeadline,
    alternateId: fieldValue(text, "Alternate Id") ?? row.alternateId,
    postedDate: parseDate(fieldValue(text, "Available Date")),
    department: fieldValue(text, "Department"),
    location: fieldValue(text, "Location"),
    infoContact: fieldValue(text, "Info Contact"),
    bidType: fieldValue(text, "Bid Type"),
    purchaseMethod: fieldValue(text, "Purchase Method"),
    bulletinDescription: fieldValue(text, "Bulletin Desc"),
    attachmentNames: attachments.names,
    attachmentUrls: attachments.urls,
    detailFetched: true,
  };
}

function rowToOpportunity(row: BsoListingRow, config: BsoPortalConfig): NormalizedOpportunity | null {
  const normalizedStatus = row.statusText?.toLowerCase().trim();
  if (normalizedStatus && INACTIVE_STATUSES.has(normalizedStatus)) return null;
  if (row.responseDeadline && row.responseDeadline.getTime() < Date.now()) return null;

  const postedDate = row.postedDate ?? UNKNOWN_POSTED_DATE;
  const description = row.bulletinDescription ?? row.description;
  return {
    externalId: `bso:${config.sourceId}:${row.solicitationId}`,
    title: row.description,
    agency: row.agency || config.agencyName,
    type: "Solicitation",
    status: "active",
    postedDate,
    responseDeadline: row.responseDeadline,
    placeOfPerformance: row.location,
    location: row.location,
    description,
    solicitationNumber: row.solicitationId,
    sourceUrl: row.sourceUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerName: "publicPortalProviders",
      providerFamily: "official_state_portal",
      providerType: "periscope_bso_shared_adapter",
      technicalPlatform: "Periscope BSO",
      discoveryMethod: "direct_official_listing",
      sourceBadge: "Dedicated BSO Adapter",
      sourceId: config.sourceId,
      portalName: config.portalName,
      portalState: config.state,
      issuingBuyer: row.agency,
      buyerContact: row.buyer,
      tenantOrigin: new URL(config.baseUrl).origin,
      listingPageUrl: row.listingPageUrl,
      listingPageNumber: row.listingPageNumber,
      sourceRecordId: row.solicitationId,
      alternateId: row.alternateId,
      statusText: row.statusText,
      department: row.department,
      infoContact: row.infoContact,
      bidType: row.bidType,
      purchaseMethod: row.purchaseMethod,
      detailFetched: row.detailFetched === true,
      documentUrls: row.attachmentUrls ?? [],
      attachmentNames: row.attachmentNames ?? [],
      dateUnknown: postedDate.getTime() === 0,
      sourceConfidence: "high",
      tags: [
        "direct-official-portal",
        "dedicated-adapter",
        "platform:periscope-bso",
        `state:${config.state}`,
        ...(postedDate.getTime() === 0 ? ["date-unknown"] : []),
        ...(row.detailFetched ? ["detail-enriched"] : []),
      ],
    },
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), Math.max(values.length, 1)) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= values.length) return;
        results[index] = await worker(values[index], index);
      }
    }),
  );
  return results;
}

export class BsoPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  constructor(readonly config: BsoPortalConfig) {}

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const maxPages = positiveIntegerEnv(`${this.config.envPrefix}_MAX_PAGES`, 5, 1, 25);
    const detailLimit = positiveIntegerEnv(`${this.config.envPrefix}_DETAIL_LIMIT`, 25, 0, 100);
    const detailConcurrency = positiveIntegerEnv(`${this.config.envPrefix}_DETAIL_CONCURRENCY`, 3, 1, 8);
    const timeoutMs = positiveIntegerEnv(`${this.config.envPrefix}_REQUEST_TIMEOUT_MS`, 15_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv(`${this.config.envPrefix}_MAX_RETRIES`, 2, 0, 5);
    const origin = new URL(this.config.baseUrl).origin;
    const queue = [this.config.listingUrl];
    const seenPages = new Set<string>();
    const seenSolicitations = new Set<string>();
    const rows: BsoListingRow[] = [];
    const errors: string[] = [];
    let pageNumber = 0;
    let advertisedTotal: number | undefined;

    while (queue.length > 0 && pageNumber < maxPages && rows.length < limit) {
      const pageUrl = queue.shift();
      if (!pageUrl) break;
      const pageKey = pageUrl.toLowerCase().replace(/#.*$/, "");
      if (seenPages.has(pageKey)) continue;
      seenPages.add(pageKey);

      let html: string;
      try {
        html = await fetchOfficialPortalText(pageUrl, {
          label: `${this.config.portalName} open-bid listing page ${pageNumber + 1}`,
          origin,
          timeoutMs,
          maxRetries,
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        if (rows.length === 0) return { records: [], total: 0, errors };
        break;
      }

      pageNumber += 1;
      advertisedTotal = advertisedTotal ?? extractTotalCount(html);
      for (const row of parseListingRows(html, this.config, pageUrl, pageNumber)) {
        const key = row.solicitationId.toLowerCase();
        if (seenSolicitations.has(key)) continue;
        seenSolicitations.add(key);
        rows.push(row);
        if (rows.length >= limit) break;
      }

      if (pageNumber >= maxPages || rows.length >= limit) continue;
      const nextUrls = extractSameOriginPaginationUrls(html, pageUrl, origin, maxPages * 4);
      for (const nextUrl of nextUrls) {
        const key = nextUrl.toLowerCase().replace(/#.*$/, "");
        if (!seenPages.has(key) && !queue.some((queued) => queued.toLowerCase().replace(/#.*$/, "") === key)) {
          queue.push(nextUrl);
        }
      }
    }

    const rowsToEnrich = rows.slice(0, detailLimit);
    const enriched = await mapWithConcurrency(rowsToEnrich, detailConcurrency, async (row) => {
      try {
        return await enrichRow(row, this.config, timeoutMs, maxRetries);
      } catch (error) {
        errors.push(`${this.config.portalName} detail ${row.solicitationId}: ${error instanceof Error ? error.message : String(error)}`);
        return row;
      }
    });
    const finalRows = [...enriched, ...rows.slice(rowsToEnrich.length)];
    const records = finalRows
      .map((row) => rowToOpportunity(row, this.config))
      .filter((record): record is NormalizedOpportunity => Boolean(record));

    if (pageNumber >= maxPages && queue.length > 0) {
      errors.push(`${this.config.portalName} pagination stopped at the configured ${maxPages}-page cap.`);
    }
    if (advertisedTotal && advertisedTotal > rows.length && queue.length === 0) {
      errors.push(
        `${this.config.portalName} advertises ${advertisedTotal} open bids but exposed no additional same-origin GET pagination links; ${rows.length} public rows were preserved from the returned page(s).`,
      );
    }

    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: true,
      healthy: true,
    };
  }
}
