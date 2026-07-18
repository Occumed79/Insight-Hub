import { createHash } from "node:crypto";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  extractSameOriginPaginationUrls,
  positiveIntegerEnv,
  sameOriginUrl,
} from "./officialPortalHttp";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export const CAL_EPROCURE_PORTAL_ID = "ca-caleprocure";
export const CAL_EPROCURE_ORIGIN = "https://caleprocure.ca.gov";
export const CAL_EPROCURE_LISTING_URL =
  "https://caleprocure.ca.gov/psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL?NoCrumbs=yes&PortalActualURL=https%3A%2F%2Fcaleprocure.ca.gov%2Fpsc%2Fpsfpd1%2FSUPPLIER%2FERP%2Fc%2FAUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL%3Fpslnkid%3DEP_SCP_AUC_RESP_INQ_AUC&PortalCRefLabel=View+Events+and+Place+Bids&PortalContentProvider=ERP&PortalContentURL=https%3A%2F%2Fcaleprocure.ca.gov%2Fpsc%2Fpsfpd1%2FSUPPLIER%2FERP%2Fc%2FAUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL%3Fpslnkid%3DEP_SCP_AUC_RESP_INQ_AUC&PortalHostNode=ERP&PortalKeyStruct=yes&PortalRegistryName=SUPPLIER&PortalServletURI=https%3A%2F%2Fcaleprocure.ca.gov%2Fpsp%2Fpsfpd1%2F&PortalURI=https%3A%2F%2Fcaleprocure.ca.gov%2Fpsc%2Fpsfpd1%2F&pslnkid=EP_SCP_AUC_RESP_INQ_AUC";

export const CAL_EPROCURE_SOURCE: PublicPortalSource = {
  id: CAL_EPROCURE_PORTAL_ID,
  agencyName: "California State Contracts Register / Cal eProcure",
  agencyType: "state",
  state: "CA",
  sourceUrl: CAL_EPROCURE_LISTING_URL,
  searchUrl: CAL_EPROCURE_LISTING_URL,
  domain: "caleprocure.ca.gov",
  portalPlatform: "Cal eProcure / PeopleSoft",
  sourceLevel: "state",
  level: "state",
  accessMode: "public_html",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated guest-access California State Contracts Register listing/detail adapter.",
};

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_PAGES = 3;
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_DETAIL_CONCURRENCY = 4;
const UNKNOWN_POSTED_DATE = new Date(0);
const ACTIVE_STATUS = /^(?:posted|open|active)$/i;
const CLOSED_STATUS = /\b(?:closed|awarded|cancelled|canceled|expired|complete|completed)\b/i;
const DOCUMENT_TEXT = /\b(?:event package|attachment|addendum|addenda|specification|document|download|line comments?\/files?)\b/i;
const DOCUMENT_PATH = /\.(?:pdf|docx?|xlsx?|csv|zip|txt)(?:$|[?#])/i;

export interface CalEprocureListingRecord {
  eventId: string;
  businessUnit: string;
  departmentName: string;
  eventName: string;
  format?: string;
  eventType?: string;
  endDate?: Date;
  status: string;
  buyerName?: string;
  buyerEmail?: string;
  detailUrl: string;
  listingPage: number;
}

export interface CalEprocureDetail {
  eventId?: string;
  agencyName?: string;
  eventFormatType?: string;
  publishedDate?: Date;
  endDate?: Date;
  description?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  documentUrls: string[];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlToText(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|td|th|section|article|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeDateText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\bPST\b/i, "GMT-0800")
    .replace(/\bPDT\b/i, "GMT-0700")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(normalizeDateText(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function extractCells(rowHtml: string): string[] {
  return Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi))
    .map((match) => htmlToText(match[1] ?? ""));
}

function extractAnchors(html: string): Array<{ href: string; text: string }> {
  return Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    .map((match) => ({ href: decodeHtml(match[1] ?? "").trim(), text: htmlToText(match[2] ?? "") }));
}

function psRelayEventUrl(businessUnit: string, eventId: string): string {
  const url = new URL("/PSRelay/AUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL", CAL_EPROCURE_ORIGIN);
  url.searchParams.set("Page", "AUC_RESP_INQ_AUC");
  url.searchParams.set("Action", "U");
  url.searchParams.set("BUSINESS_UNIT", businessUnit);
  url.searchParams.set("AUC_ID", eventId);
  return url.toString();
}

function detailUrlFromRow(rowHtml: string, pageUrl: string, businessUnit: string, eventId: string): string {
  for (const anchor of extractAnchors(rowHtml)) {
    let url: URL;
    try {
      url = new URL(anchor.href, pageUrl);
    } catch {
      continue;
    }
    if (url.origin !== CAL_EPROCURE_ORIGIN) continue;
    if (!/AUC_RESP_INQ_(?:DTL|AUC)\.GBL/i.test(url.pathname)) continue;
    if ((url.searchParams.get("AUC_ID") ?? "").toLowerCase() !== eventId.toLowerCase()) continue;
    return canonicalUrl(url.toString());
  }
  return psRelayEventUrl(businessUnit, eventId);
}

function isExpired(deadline: Date | undefined): boolean {
  return Boolean(deadline && deadline.getTime() < Date.now());
}

export function parseCalEprocureListingHtml(
  html: string,
  pageUrl = CAL_EPROCURE_LISTING_URL,
  listingPage = 1,
): CalEprocureListingRecord[] {
  const records: CalEprocureListingRecord[] = [];
  const seen = new Set<string>();

  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = row[0];
    const cells = extractCells(rowHtml);
    if (cells.length < 8) continue;

    const businessUnit = cells[0]?.trim() ?? "";
    const departmentName = cells[1]?.trim() ?? "";
    const eventId = cells[2]?.trim() ?? "";
    const eventName = cells[3]?.trim() ?? "";
    const format = cells[4]?.trim() || undefined;
    const eventType = cells[5]?.trim() || undefined;
    const endDate = parseDate(cells[6]);
    const status = cells[7]?.trim() ?? "";
    const buyerName = cells[8]?.trim() || undefined;
    const buyerEmail = cells[9]?.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];

    if (!/^\d{4}$/.test(businessUnit)) continue;
    if (!/^[A-Z0-9][A-Z0-9._-]{4,}$/i.test(eventId)) continue;
    if (!departmentName || !eventName) continue;
    if (!ACTIVE_STATUS.test(status) || CLOSED_STATUS.test(status) || isExpired(endDate)) continue;

    const key = `${businessUnit}:${eventId}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    records.push({
      eventId,
      businessUnit,
      departmentName,
      eventName,
      format,
      eventType,
      endDate,
      status,
      buyerName,
      buyerEmail,
      detailUrl: detailUrlFromRow(rowHtml, pageUrl, businessUnit, eventId),
      listingPage,
    });
  }

  return records;
}

function labelValue(text: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:?\\s*(?:\\n\\s*)?([^\\n]+)`, "i"));
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function sectionValue(text: string, startLabels: readonly string[], endLabels: readonly string[]): string | undefined {
  const starts = startLabels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const ends = endLabels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${starts})\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${ends})\\s*:?|$)`, "i"));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function extractDocumentUrls(html: string, detailUrl: string): string[] {
  const urls = new Set<string>();
  for (const anchor of extractAnchors(html)) {
    let absolute: URL;
    try {
      absolute = new URL(anchor.href, detailUrl);
    } catch {
      continue;
    }
    if (absolute.origin !== CAL_EPROCURE_ORIGIN) continue;
    if (!DOCUMENT_PATH.test(absolute.pathname + absolute.search) && !DOCUMENT_TEXT.test(anchor.text)) continue;
    const safe = sameOriginUrl(absolute.toString(), CAL_EPROCURE_ORIGIN);
    if (safe) urls.add(safe);
  }
  return Array.from(urls);
}

export function parseCalEprocureDetailHtml(html: string, detailUrl: string): CalEprocureDetail {
  const text = htmlToText(html);
  const email = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  const phone = text.match(/(?:\+?1[ .\/-]?)?\(?\d{3}\)?[ .\/-]\d{3}[ .\/-]\d{4}(?:\s*(?:x|ext\.?)\s*\d+)?/i)?.[0];
  const agencyHeading = Array.from(html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi))
    .map((match) => htmlToText(match[1] ?? ""))
    .find((value) => value && !/contracts register event details|response bid inquiry/i.test(value));

  return {
    eventId: labelValue(text, ["Event ID"]),
    agencyName: agencyHeading,
    eventFormatType: labelValue(text, ["Event Format/Type"]),
    publishedDate: parseDate(labelValue(text, ["Published Date"])),
    endDate: parseDate(labelValue(text, ["Event End Date", "Event End Date:"])),
    description: sectionValue(
      text,
      ["Event Description"],
      ["Payment Terms", "My Bids", "Edits to Submitted Bids", "Multiple Bids", "Contact", "Bid Line Comment/Attachments", "Lines"],
    ),
    contactName: labelValue(text, ["Contact"]),
    contactPhone: phone,
    contactEmail: email,
    documentUrls: extractDocumentUrls(html, detailUrl),
  };
}

function parseOpportunityType(title: string, detail?: CalEprocureDetail, listing?: CalEprocureListingRecord): string {
  const text = `${title} ${detail?.description ?? ""} ${detail?.eventFormatType ?? ""} ${listing?.eventType ?? ""}`.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(text)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotes?/.test(text)) return "RFQ";
  if (/\brfi\b|request for information/.test(text)) return "RFI";
  if (/\bifb\b|invitation for bids?|invitation to bid/.test(text)) return "Bid";
  return "Solicitation";
}

function matchesOptions(record: NormalizedOpportunity, options: FetchOptions): boolean {
  const keywords = options.keywords?.toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords?.length) {
    const haystack = [record.title, record.agency, record.description, record.solicitationNumber]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!keywords.some((keyword) => haystack.includes(keyword))) return false;
  }
  if (options.dateRange && record.postedDate.getTime() > 0) {
    const cutoff = Date.now() - options.dateRange * 86_400_000;
    if (record.postedDate.getTime() < cutoff) return false;
  }
  return true;
}

function toOpportunity(
  listing: CalEprocureListingRecord,
  detail: CalEprocureDetail | undefined,
): NormalizedOpportunity | undefined {
  const deadline = detail?.endDate ?? listing.endDate;
  if (isExpired(deadline)) return undefined;
  const postedDate = detail?.publishedDate;
  const agency = detail?.agencyName?.trim() || listing.departmentName;
  const documentUrls = Array.from(new Set(detail?.documentUrls ?? []));
  const canonical = canonicalUrl(listing.detailUrl);

  return {
    externalId: `caleprocure-${listing.eventId.replace(/[^a-z0-9._-]/gi, "-")}`,
    title: listing.eventName,
    agency,
    subAgency: listing.buyerName,
    type: parseOpportunityType(listing.eventName, detail, listing),
    status: "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline: deadline,
    placeOfPerformance: "California",
    description: detail?.description,
    solicitationNumber: listing.eventId,
    sourceUrl: canonical,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "cal_eprocure_peoplesoft",
      providerType: "caleprocure_guest_listing_detail",
      connectorName: "California Cal eProcure dedicated adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "California State Contracts Register",
      sourceConfidence: "high",
      sourceId: CAL_EPROCURE_PORTAL_ID,
      nativeOpportunityId: listing.eventId,
      businessUnit: listing.businessUnit,
      buyerName: listing.buyerName,
      buyerEmail: detail?.contactEmail ?? listing.buyerEmail,
      buyerPhone: detail?.contactPhone,
      listingUrl: CAL_EPROCURE_LISTING_URL,
      canonicalUrl: canonical,
      listingPage: listing.listingPage,
      eventFormat: listing.format,
      eventType: listing.eventType,
      documentUrls,
      dateUnknown: !postedDate,
      deadlineUnknown: !deadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "cal-eprocure-platform",
        "state:CA",
        `business-unit:${listing.businessUnit}`,
        ...(!postedDate ? ["date-unknown"] : []),
        ...(!deadline ? ["deadline-unknown"] : []),
      ],
    },
  };
}

function headerValue(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);
  return value?.trim() || undefined;
}

class PeopleSoftSession {
  private readonly cookies = new Map<string, string>();

  private absorbCookies(headers: Headers): void {
    const extended = headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = extended.getSetCookie?.()
      ?? (headerValue(headers, "set-cookie") ? [headerValue(headers, "set-cookie") as string] : []);
    for (const cookie of setCookies) {
      const pair = cookie.split(";", 1)[0]?.trim();
      const equals = pair?.indexOf("=") ?? -1;
      if (!pair || equals <= 0) continue;
      this.cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
  }

  private cookieHeader(): string | undefined {
    if (!this.cookies.size) return undefined;
    return Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private async requestChain(url: string, timeoutMs: number): Promise<Response> {
    let current = sameOriginUrl(url, CAL_EPROCURE_ORIGIN);
    if (!current) throw new Error("Cal eProcure rejected a cross-origin URL");

    for (let redirects = 0; redirects <= 6; redirects += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(current, {
          signal: controller.signal,
          redirect: "manual",
          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
            ...(this.cookieHeader() ? { cookie: this.cookieHeader() as string } : {}),
          },
        });
        this.absorbCookies(response.headers);
        if (response.status < 300 || response.status >= 400) return response;
        const location = headerValue(response.headers, "location");
        if (!location) return response;
        const next = sameOriginUrl(new URL(location, current).toString(), CAL_EPROCURE_ORIGIN);
        if (!next) throw new Error("Cal eProcure redirected outside its official origin");
        current = next;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error("Cal eProcure exceeded its redirect limit");
  }

  async fetchText(url: string, label: string, timeoutMs: number, maxRetries: number): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await this.requestChain(url, timeoutMs);
        const body = await response.text();
        if (response.ok && !/must have cookies enabled|errorPg=ckreq/i.test(body)) return body;

        const retryable = response.status === 429 || response.status >= 500
          || /must have cookies enabled|errorPg=ckreq/i.test(body);
        const message = `${label} returned HTTP ${response.status}${body ? `: ${htmlToText(body).slice(0, 160)}` : ""}`;
        if (!retryable || attempt >= maxRetries) throw new Error(message);
        const retryAfter = Number.parseInt(headerValue(response.headers, "retry-after") ?? "", 10);
        await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 400 * 2 ** attempt));
        lastError = new Error(message);
      } catch (error) {
        lastError = error;
        if (attempt >= maxRetries) break;
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
      }
    }
    if (lastError instanceof Error) {
      if (lastError.name === "AbortError") throw new Error(`${label} timed out after ${timeoutMs}ms`);
      throw lastError;
    }
    throw new Error(`${label} request failed`);
  }
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  }));
  return results;
}

export class CalEprocureProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("CAL_EPROCURE_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("CAL_EPROCURE_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 2);
    const maxPages = positiveIntegerEnv("CAL_EPROCURE_MAX_PAGES", DEFAULT_MAX_PAGES, 1, 10);
    const maxResults = positiveIntegerEnv("CAL_EPROCURE_MAX_RESULTS", DEFAULT_MAX_RESULTS, 1, 500);
    const detailConcurrency = positiveIntegerEnv("CAL_EPROCURE_DETAIL_CONCURRENCY", DEFAULT_DETAIL_CONCURRENCY, 1, 8);
    const offset = Math.max(options.offset ?? 0, 0);
    const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    const targetCount = Math.min(maxResults, offset + requestedLimit);
    const queue = [CAL_EPROCURE_LISTING_URL];
    const seenPages = new Set<string>();
    const seenSignatures = new Set<string>();
    const listings = new Map<string, CalEprocureListingRecord>();
    const errors: string[] = [];
    const session = new PeopleSoftSession();
    let listingPage = 0;

    while (queue.length && listingPage < maxPages && listings.size < targetCount) {
      const pageUrl = queue.shift();
      if (!pageUrl) break;
      const safePageUrl = sameOriginUrl(pageUrl, CAL_EPROCURE_ORIGIN);
      if (!safePageUrl) {
        errors.push(`ca-caleprocure: rejected cross-origin listing URL ${pageUrl}`);
        continue;
      }
      const pageKey = canonicalUrl(safePageUrl).toLowerCase();
      if (seenPages.has(pageKey)) continue;
      seenPages.add(pageKey);

      let html: string;
      try {
        html = await session.fetchText(safePageUrl, "Cal eProcure listing", timeoutMs, maxRetries);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (!listings.size) {
          this.lastError = reason;
          return { records: [], total: 0, errors: [`ca-caleprocure: ${reason}`] };
        }
        errors.push(`ca-caleprocure: partial listing results after ${reason}`);
        break;
      }

      const signature = stableHash(htmlToText(html));
      if (seenSignatures.has(signature)) break;
      seenSignatures.add(signature);
      listingPage += 1;

      for (const listing of parseCalEprocureListingHtml(html, safePageUrl, listingPage)) {
        const key = `${listing.businessUnit}:${listing.eventId}`.toLowerCase();
        if (!listings.has(key)) listings.set(key, listing);
        if (listings.size >= targetCount) break;
      }

      if (listingPage >= maxPages || listings.size >= targetCount) continue;
      for (const nextUrl of extractSameOriginPaginationUrls(html, safePageUrl, CAL_EPROCURE_ORIGIN, maxPages * 3)) {
        const nextKey = canonicalUrl(nextUrl).toLowerCase();
        if (!seenPages.has(nextKey) && !queue.some((queued) => canonicalUrl(queued).toLowerCase() === nextKey)) queue.push(nextUrl);
      }
    }

    const selectedListings = Array.from(listings.values()).slice(0, targetCount);
    const enriched = await mapConcurrent(selectedListings, detailConcurrency, async (listing) => {
      let detail: CalEprocureDetail | undefined;
      try {
        const html = await session.fetchText(listing.detailUrl, `Cal eProcure detail ${listing.eventId}`, timeoutMs, maxRetries);
        detail = parseCalEprocureDetailHtml(html, listing.detailUrl);
      } catch (error) {
        errors.push(`ca-caleprocure:${listing.eventId}: detail enrichment failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return toOpportunity(listing, detail);
    });

    const seen = new Set<string>();
    const records = enriched
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => matchesOptions(record, options))
      .filter((record) => {
        if (seen.has(record.externalId)) return false;
        seen.add(record.externalId);
        return true;
      })
      .slice(offset, offset + requestedLimit);

    this.recordCount = records.length;
    this.lastError = errors.length && !records.length ? errors.join("; ") : undefined;
    if (records.length || !errors.length) this.lastSuccess = new Date();
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: true,
      healthy: !this.lastError,
      errorMessage: this.lastError,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      recordCount: this.recordCount,
    };
  }
}

export const calEprocureProvider = new CalEprocureProvider();
