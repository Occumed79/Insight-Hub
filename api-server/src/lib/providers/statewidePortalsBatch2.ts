import { createHash } from "node:crypto";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { extractSameOriginPaginationUrls } from "./officialPortalHttp";

export interface StatewidePortalBatchSource {
  portalId: string;
  buyerName: string;
  state: string;
  listingUrl: string;
  origin: string;
  platform: string;
  sourceBadge: string;
}

export const STATEWIDE_BATCH_2_SOURCES = [
  {
    portalId: "fl-vbs",
    buyerName: "State of Florida",
    state: "FL",
    listingUrl: "https://vendor.myfloridamarketplace.com/search/bids",
    origin: "https://vendor.myfloridamarketplace.com",
    platform: "florida_vendor_bid_system",
    sourceBadge: "Florida VBS",
  },
  {
    portalId: "ga-gpr",
    buyerName: "State of Georgia",
    state: "GA",
    listingUrl: "https://ssl.doas.state.ga.us/gpr/",
    origin: "https://ssl.doas.state.ga.us",
    platform: "georgia_procurement_registry",
    sourceBadge: "Georgia Procurement Registry",
  },
  {
    portalId: "la-lapac",
    buyerName: "State of Louisiana",
    state: "LA",
    listingUrl: "https://wwwcfprd.doa.louisiana.gov/osp/lapac/deptbids.cfm",
    origin: "https://wwwcfprd.doa.louisiana.gov",
    platform: "louisiana_lapac",
    sourceBadge: "Louisiana LaPAC",
  },
  {
    portalId: "me-rfps",
    buyerName: "State of Maine",
    state: "ME",
    listingUrl: "https://mevss.hostams.com/PRDVSS1X1/AltSelfService",
    origin: "https://mevss.hostams.com",
    platform: "maine_vendor_self_service",
    sourceBadge: "Maine VSS",
  },
  {
    portalId: "ms-magic",
    buyerName: "State of Mississippi",
    state: "MS",
    listingUrl: "https://www.ms.gov/dfa/contract_bid_search/Search",
    origin: "https://www.ms.gov",
    platform: "mississippi_procurement_search",
    sourceBadge: "Mississippi Procurement Search",
  },
  {
    portalId: "nm-active-procurements",
    buyerName: "State of New Mexico",
    state: "NM",
    listingUrl: "https://www.generalservices.state.nm.us/statepurchasing/active-procurements",
    origin: "https://www.generalservices.state.nm.us",
    platform: "new_mexico_active_procurements",
    sourceBadge: "New Mexico Active Procurements",
  },
] as const satisfies readonly StatewidePortalBatchSource[];

export const STATEWIDE_BATCH_2_PORTAL_IDS = new Set<string>(
  STATEWIDE_BATCH_2_SOURCES.map((source) => source.portalId),
);

const SOURCE_BY_ID = new Map<string, StatewidePortalBatchSource>(STATEWIDE_BATCH_2_SOURCES.map((source) => [source.portalId, source]));
const UNKNOWN_DATE = new Date(0);
const CLOSED_STATUS = /\b(?:closed|awarded|cancelled|canceled|expired|withdrawn|completed|archived)\b/i;
const OPPORTUNITY_WORDS = /\b(?:bid|rfp|rfq|rfi|itb|ifb|solicitation|opportunity|procurement|request for proposal|invitation for bid)\b/i;
const DOCUMENT_WORDS = /\b(?:attachment|document|specification|addendum|addenda|amendment|notice|download|package)\b/i;
const LOGIN_WALL = /\b(?:sign in|log in|login required|vendor login|authentication required|unsupported browser|access denied|browser check)\b/i;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_DETAIL_CONCURRENCY = 4;

export interface StatewideListingRecord {
  nativeId: string;
  solicitationNumber?: string;
  title: string;
  agency?: string;
  subAgency?: string;
  type?: string;
  status?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  description?: string;
  category?: string;
  detailUrl: string;
  listingPage: number;
}

export interface StatewideDetailRecord {
  title?: string;
  agency?: string;
  subAgency?: string;
  type?: string;
  status?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  description?: string;
  category?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  placeOfPerformance?: string;
  documentUrls: string[];
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: URLSearchParams;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const parsed = Number(code);
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : "";
    });
}

function stripMarkup(value: string): string {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/tr>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\t\r ]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizeUrl(value: string, pageUrl: string, origin: string): string | undefined {
  try {
    const url = new URL(decodeHtml(value), pageUrl);
    if (url.origin !== origin) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value
    .replace(/\b(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function labelValue(markup: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const cell = markup.match(new RegExp(
      `<(?:th|td|dt|div|span)[^>]*>\\s*${escaped}\\s*:?[\\s\\S]*?<\\/(?:th|td|dt|div|span)>\\s*<(?:td|dd|div|span)[^>]*>([\\s\\S]*?)<\\/(?:td|dd|div|span)>`,
      "i",
    ));
    if (cell?.[1]) {
      const value = stripMarkup(cell[1]);
      if (value) return value;
    }
    const text = stripMarkup(markup);
    const line = text.match(new RegExp(`(?:^|\\n)${escaped}\\s*:?\\s*([^\\n]{1,300})`, "i"));
    if (line?.[1]?.trim()) return line[1].trim();
  }
  return undefined;
}

function solicitationFromText(value: string): string | undefined {
  const patterns = [
    /\b(?:solicitation|bid|rfp|rfq|rfi|itb|ifb|rfx|smart)\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,})/i,
    /\b([A-Z]{1,8}-\d{2,}[A-Z0-9._/-]*)\b/i,
    /\b(\d{2,}-\d{6,}[A-Z0-9._/-]*)\b/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern)?.[1]?.trim();
    if (match) return match;
  }
  return undefined;
}

function nativeIdFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    for (const key of ["id", "bidId", "bidID", "eventId", "eventID", "solicitationId", "solicitationID", "docId", "documentId", "rfpId", "rfqId", "noticeId", "SmartNumber"]) {
      const value = parsed.searchParams.get(key);
      if (value?.trim()) return value.trim();
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    if (last && /^(?:\d+|[A-Z0-9][A-Z0-9._-]{2,})$/i.test(last) && !/^(?:search|bids?|solicitations?|opportunities|details?)$/i.test(last)) {
      return last;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function stableNativeId(source: StatewidePortalBatchSource, url: string, text: string): string {
  return nativeIdFromUrl(url)
    ?? solicitationFromText(text)
    ?? createHash("sha256").update(`${source.portalId}|${url}`).digest("hex").slice(0, 24);
}

function extractAnchors(markup: string, pageUrl: string, origin: string): Array<{ url: string; text: string }> {
  const anchors: Array<{ url: string; text: string }> = [];
  for (const match of markup.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = normalizeUrl(match[1] ?? "", pageUrl, origin);
    const text = stripMarkup(match[2] ?? "");
    if (url && text) anchors.push({ url, text });
  }
  return anchors;
}

function candidateSections(html: string): string[] {
  const sections: string[] = [];
  for (const pattern of [
    /<article\b[^>]*>[\s\S]*?<\/article>/gi,
    /<li\b[^>]*>[\s\S]*?<\/li>/gi,
    /<div\b[^>]*(?:class|id)=["'][^"']*(?:bid|solicitation|opportunity|procurement|result|card|event)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
    /<h[1-4]\b[^>]*>[\s\S]*?\bBID\s*:[\s\S]*?(?=<h[1-4]\b|$)/gi,
  ]) {
    for (const match of html.matchAll(pattern)) sections.push(match[0]);
  }
  return sections;
}

function isLikelyDetailLink(source: StatewidePortalBatchSource, url: string, text: string, context: string): boolean {
  const combined = `${text} ${context}`;
  if (!OPPORTUNITY_WORDS.test(combined) && !solicitationFromText(combined)) return false;
  const lower = url.toLowerCase();
  if (/\.(?:pdf|docx?|xlsx?|csv|zip)(?:$|[?#])/.test(lower)) return false;
  if (/\b(?:login|register|help|contact|faq|vendor-registration|unsupported)\b/.test(lower)) return false;
  if (source.portalId === "ms-magic" && /\/contract\/details\//i.test(lower)) return false;
  return /(?:detail|bid|solicitation|opportun|event|rfp|rfq|rfx|notice|document)/i.test(lower)
    || Boolean(nativeIdFromUrl(url))
    || Boolean(solicitationFromText(combined));
}

function listingFromSection(
  source: StatewidePortalBatchSource,
  section: string,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord | undefined {
  const text = stripMarkup(section);
  if (!text || !OPPORTUNITY_WORDS.test(text)) return undefined;
  const anchors = extractAnchors(section, pageUrl, source.origin);
  const detail = anchors.find((anchor) => isLikelyDetailLink(source, anchor.url, anchor.text, text));
  if (!detail) return undefined;
  const status = labelValue(section, ["Status", "Bid Status", "Event Status"])
    ?? text.match(/\b(?:Status)\s*:?\s*(Open|Active|Posted|Closed|Awarded|Cancelled|Canceled|Expired|Archived)\b/i)?.[1];
  if (status && CLOSED_STATUS.test(status)) return undefined;
  const title = detail.text.replace(/^\s*(?:BID|RFP|RFQ|RFI|ITB|IFB)\s*:\s*/i, "").trim();
  const solicitationNumber = labelValue(section, ["Solicitation Number", "Bid Number", "RFx Number", "RFX #", "Smart Number", "Event ID"])
    ?? solicitationFromText(text);
  const agency = labelValue(section, ["Agency", "Department/Agency", "Department", "Issuing Agency", "Organization"]);
  const postedDate = parseDate(labelValue(section, ["Advertised Date", "Published Date", "Posted Date", "Issue Date", "Open Date"]));
  const responseDeadline = parseDate(labelValue(section, ["Submission Date", "Closing Date", "Response Deadline", "Bid Opening Date", "Open Date", "End Date"]));
  if (responseDeadline && responseDeadline.getTime() < Date.now()) return undefined;
  const nativeId = stableNativeId(source, detail.url, `${solicitationNumber ?? ""} ${text}`);
  return {
    nativeId,
    solicitationNumber: solicitationNumber ?? nativeId,
    title: title || solicitationNumber || "Untitled public procurement opportunity",
    agency,
    subAgency: labelValue(section, ["Division", "Office", "Unit"]),
    type: labelValue(section, ["Type", "RFx Type", "Procurement Type"]),
    status: status ?? "Open",
    postedDate,
    responseDeadline,
    description: labelValue(section, ["Description", "Scope"]),
    category: labelValue(section, ["Category", "Commodity", "Major Procurement Category"]),
    detailUrl: detail.url,
    listingPage,
  };
}

function tableRecords(
  source: StatewidePortalBatchSource,
  html: string,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord[] {
  const records: StatewideListingRecord[] = [];
  for (const tableMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = tableMatch[1] ?? "";
    const rows = Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1] ?? "");
    if (rows.length < 2) continue;
    const headers = Array.from(rows[0]!.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi))
      .map((match) => stripMarkup(match[1] ?? "").toLowerCase());
    if (!headers.some((header) => /(?:bid|solicitation|rfx|rfp|rfq|description|title)/i.test(header))) continue;
    for (const row of rows.slice(1)) {
      const cells = Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => match[1] ?? "");
      if (!cells.length) continue;
      const values = new Map<string, string>();
      headers.forEach((header, index) => {
        const value = cells[index] ? stripMarkup(cells[index]!) : "";
        if (header && value) values.set(header, value);
      });
      const rowText = stripMarkup(row);
      const anchors = extractAnchors(row, pageUrl, source.origin);
      const detail = anchors.find((anchor) => isLikelyDetailLink(source, anchor.url, anchor.text, rowText));
      if (!detail) continue;
      const get = (...patterns: RegExp[]): string | undefined => {
        for (const [header, value] of values) if (patterns.some((pattern) => pattern.test(header))) return value;
        return undefined;
      };
      const status = get(/status/);
      if (status && CLOSED_STATUS.test(status)) continue;
      const responseDeadline = parseDate(get(/submission/, /closing/, /deadline/, /opening/, /end date/));
      if (responseDeadline && responseDeadline.getTime() < Date.now()) continue;
      const solicitationNumber = get(/solicitation/, /bid number/, /rfx/, /rfp/, /rfq/, /smart number/) ?? solicitationFromText(rowText);
      const nativeId = stableNativeId(source, detail.url, `${solicitationNumber ?? ""} ${rowText}`);
      records.push({
        nativeId,
        solicitationNumber: solicitationNumber ?? nativeId,
        title: detail.text.replace(/^\s*(?:BID|RFP|RFQ|RFI|ITB|IFB)\s*:\s*/i, "").trim(),
        agency: get(/agency/, /department/, /organization/),
        subAgency: get(/division/, /office/, /unit/),
        type: get(/type/),
        status: status ?? "Open",
        postedDate: parseDate(get(/advertised/, /published/, /posted/, /issue date/)),
        responseDeadline,
        description: get(/description/, /scope/),
        category: get(/category/, /commodity/),
        detailUrl: detail.url,
        listingPage,
      });
    }
  }
  return records;
}

function parseEmbeddedJson(
  source: StatewidePortalBatchSource,
  html: string,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord[] {
  const records: StatewideListingRecord[] = [];
  const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)).map((match) => match[1] ?? "");
  for (const script of scripts) {
    if (!/(?:solicitation|opportunity|bid|rfp|rfq)/i.test(script)) continue;
    for (const objectMatch of script.matchAll(/\{[^{}]{0,3000}(?:title|name|description)[^{}]{0,3000}\}/gi)) {
      const fragment = objectMatch[0];
      const get = (keys: string[]): string | undefined => {
        for (const key of keys) {
          const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const value = fragment.match(new RegExp(`["']${escaped}["']\\s*:\\s*["']([^"']+)["']`, "i"))?.[1];
          if (value) return decodeHtml(value);
        }
        return undefined;
      };
      const rawUrl = get(["url", "href", "detailUrl", "detailsUrl", "link"]);
      const detailUrl = rawUrl ? normalizeUrl(rawUrl, pageUrl, source.origin) : undefined;
      const title = get(["title", "name", "eventName", "description"]);
      if (!detailUrl || !title || !OPPORTUNITY_WORDS.test(`${title} ${fragment}`)) continue;
      const status = get(["status", "eventStatus", "bidStatus"]);
      if (status && CLOSED_STATUS.test(status)) continue;
      const responseDeadline = parseDate(get(["deadline", "closingDate", "endDate", "responseDeadline", "submissionDate"]));
      if (responseDeadline && responseDeadline.getTime() < Date.now()) continue;
      const solicitationNumber = get(["solicitationNumber", "bidNumber", "eventId", "id", "number"]);
      const nativeId = solicitationNumber ?? stableNativeId(source, detailUrl, fragment);
      records.push({
        nativeId,
        solicitationNumber: solicitationNumber ?? nativeId,
        title,
        agency: get(["agency", "department", "organization", "buyer"]),
        status: status ?? "Open",
        postedDate: parseDate(get(["postedDate", "publishedDate", "issueDate", "openDate"])),
        responseDeadline,
        description: get(["description", "summary"]),
        category: get(["category", "commodity"]),
        detailUrl,
        listingPage,
      });
    }
  }
  return records;
}

export function parseStatewidePortalListingHtml(
  portalId: string,
  html: string,
  pageUrl?: string,
  listingPage = 1,
): StatewideListingRecord[] {
  const source = SOURCE_BY_ID.get(portalId);
  if (!source) throw new Error(`Unknown statewide portal source: ${portalId}`);
  const effectivePageUrl = pageUrl ?? source.listingUrl;
  const records: StatewideListingRecord[] = tableRecords(source, html, effectivePageUrl, listingPage);
  for (const section of candidateSections(html)) {
    const record = listingFromSection(source, section, effectivePageUrl, listingPage);
    if (record) records.push(record);
  }
  records.push(...parseEmbeddedJson(source, html, effectivePageUrl, listingPage));
  const deduped = new Map<string, StatewideListingRecord>();
  for (const record of records) {
    const key = `${record.nativeId}|${record.detailUrl}`.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, record);
  }
  return Array.from(deduped.values());
}

export function parseStatewidePortalDetailHtml(
  portalId: string,
  html: string,
  detailUrl: string,
): StatewideDetailRecord {
  const source = SOURCE_BY_ID.get(portalId);
  if (!source) throw new Error(`Unknown statewide portal source: ${portalId}`);
  const text = stripMarkup(html);
  const documentUrls = new Map<string, string>();
  for (const anchor of extractAnchors(html, detailUrl, source.origin)) {
    if (DOCUMENT_WORDS.test(anchor.text) || /\.(?:pdf|docx?|xlsx?|csv|zip|txt)(?:$|[?#])/i.test(anchor.url)) {
      documentUrls.set(anchor.url.toLowerCase(), anchor.url);
    }
  }
  const responseDeadline = parseDate(labelValue(html, ["Submission Date", "Closing Date", "Response Deadline", "Bid Opening Date", "Open Date", "End Date"]));
  return {
    title: labelValue(html, ["Title", "Solicitation Title", "Bid Title", "Event Name"]),
    agency: labelValue(html, ["Agency", "Department/Agency", "Department", "Issuing Agency", "Organization"]),
    subAgency: labelValue(html, ["Division", "Office", "Unit"]),
    type: labelValue(html, ["Type", "RFx Type", "Procurement Type"]),
    status: labelValue(html, ["Status", "Bid Status", "Event Status"]),
    postedDate: parseDate(labelValue(html, ["Advertised Date", "Published Date", "Posted Date", "Issue Date"])),
    responseDeadline,
    description: labelValue(html, ["Description", "Scope", "Solicitation Description"])
      ?? text.match(/(?:Description|Scope)\s*:?\s*([\s\S]{20,1200}?)(?=\n[A-Z][A-Za-z /]{2,40}:|$)/i)?.[1]?.trim(),
    category: labelValue(html, ["Category", "Commodity", "Major Procurement Category"]),
    contactName: labelValue(html, ["Buyer", "Contact", "Contact Name"]),
    contactEmail: labelValue(html, ["Email", "Contact Email"])
      ?? text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0],
    contactPhone: labelValue(html, ["Phone", "Contact Phone"])
      ?? text.match(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/)?.[0],
    placeOfPerformance: labelValue(html, ["Location", "Delivery Location", "Place of Performance"]),
    documentUrls: Array.from(documentUrls.values()),
  };
}

async function requestText(
  source: StatewidePortalBatchSource,
  url: string,
  options: RequestOptions = {},
): Promise<string> {
  const normalized = normalizeUrl(url, source.listingUrl, source.origin);
  if (!normalized) throw new Error(`${source.portalId}: rejected cross-origin URL`);
  let lastError: unknown;
  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(normalized, {
        method: options.method ?? "GET",
        body: options.body,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "content-type": options.body ? "application/x-www-form-urlencoded" : "text/plain",
          "user-agent": "Mozilla/5.0 (compatible; OccuMed-InsightHub/1.0; +https://www.occumed.com)",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`${source.portalId}: redirect had no location`);
        const redirectUrl = normalizeUrl(location, normalized, source.origin);
        if (!redirectUrl) throw new Error(`${source.portalId}: redirected outside official origin`);
        return requestText(source, redirectUrl, { method: "GET" });
      }
      const body = await response.text();
      if (response.ok) return body;
      const retryable = response.status === 429 || response.status >= 500;
      const error = new Error(`${source.portalId}: HTTP ${response.status}${body ? `: ${stripMarkup(body).slice(0, 180)}` : ""}`);
      if (!retryable || attempt >= DEFAULT_MAX_RETRIES) throw error;
      lastError = error;
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 400 * 2 ** attempt));
    } catch (error) {
      lastError = error;
      if (attempt >= DEFAULT_MAX_RETRIES) break;
      if (error instanceof Error && /HTTP 4\d\d/.test(error.message) && !/HTTP 429/.test(error.message)) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError instanceof Error) {
    if (lastError.name === "AbortError") throw new Error(`${source.portalId}: timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    throw lastError;
  }
  throw new Error(`${source.portalId}: request failed`);
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      output[index] = await worker(item);
    }
  }));
  return output;
}

function matchesOptions(record: StatewideListingRecord, detail: StatewideDetailRecord, options: FetchOptions): boolean {
  if (detail.status && CLOSED_STATUS.test(detail.status)) return false;
  const deadline = detail.responseDeadline ?? record.responseDeadline;
  if (deadline && deadline.getTime() < Date.now()) return false;
  if (options.keywords?.trim()) {
    const terms = options.keywords.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const haystack = [record.title, detail.title, record.agency, detail.agency, record.subAgency, detail.subAgency, record.description, detail.description, record.solicitationNumber, record.category, detail.category]
      .filter(Boolean).join(" ").toLowerCase();
    if (!terms.every((term) => haystack.includes(term))) return false;
  }
  if (options.dateRange && options.dateRange > 0) {
    const posted = detail.postedDate ?? record.postedDate;
    if (posted && posted.getTime() !== 0) {
      const cutoff = Date.now() - options.dateRange * 86_400_000;
      if (posted.getTime() < cutoff) return false;
    }
  }
  return true;
}

export class StatewidePortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(readonly source: StatewidePortalBatchSource) {}

  async isConfigured(): Promise<boolean> { return true; }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const errors: string[] = [];
    const requestedLimit = Math.min(Math.max(options.limit ?? 100, 1), DEFAULT_MAX_RESULTS);
    const offset = Math.max(options.offset ?? 0, 0);
    const target = Math.min(DEFAULT_MAX_RESULTS, offset + requestedLimit);
    const queue: string[] = [this.source.listingUrl];
    const seenPages = new Set<string>();
    const seenSignatures = new Set<string>();
    const listings = new Map<string, StatewideListingRecord>();
    let pageNumber = 0;

    while (queue.length && pageNumber < DEFAULT_MAX_PAGES && listings.size < target) {
      const pageUrl = queue.shift();
      if (!pageUrl) break;
      const normalizedPage = pageUrl.toLowerCase();
      if (seenPages.has(normalizedPage)) continue;
      seenPages.add(normalizedPage);
      let html: string;
      try {
        html = await requestText(this.source, pageUrl);
      } catch (error) {
        errors.push(`${this.source.portalId}: listing fetch failed: ${error instanceof Error ? error.message : String(error)}`);
        if (listings.size === 0) {
          this.lastError = errors.at(-1);
          return { records: [], total: 0, errors };
        }
        break;
      }
      pageNumber += 1;
      const signature = createHash("sha256").update(html).digest("hex");
      if (seenSignatures.has(signature)) break;
      seenSignatures.add(signature);
      if (LOGIN_WALL.test(stripMarkup(html).slice(0, 2000)) && !OPPORTUNITY_WORDS.test(stripMarkup(html))) {
        errors.push(`${this.source.portalId}: public page returned a login/browser wall instead of solicitation rows`);
        if (listings.size === 0) return { records: [], total: 0, errors };
        break;
      }
      for (const listing of parseStatewidePortalListingHtml(this.source.portalId, html, pageUrl, pageNumber)) {
        const key = `${listing.nativeId}|${listing.detailUrl}`.toLowerCase();
        if (!listings.has(key)) listings.set(key, listing);
        if (listings.size >= target) break;
      }
      for (const next of extractSameOriginPaginationUrls(html, pageUrl, this.source.origin, DEFAULT_MAX_PAGES * 3)) {
        if (!seenPages.has(next.toLowerCase()) && !queue.some((queued) => queued.toLowerCase() === next.toLowerCase())) queue.push(next);
      }
    }

    const listingValues = Array.from(listings.values()).slice(0, target);
    const enriched = await mapConcurrent(listingValues, DEFAULT_DETAIL_CONCURRENCY, async (listing) => {
      let detail: StatewideDetailRecord = { documentUrls: [] };
      if (listing.detailUrl !== this.source.listingUrl) {
        try {
          const html = await requestText(this.source, listing.detailUrl);
          detail = parseStatewidePortalDetailHtml(this.source.portalId, html, listing.detailUrl);
        } catch (error) {
          errors.push(`${this.source.portalId}: detail enrichment failed for ${listing.nativeId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return { listing, detail };
    });

    const eligible = enriched.filter(({ listing, detail }) => matchesOptions(listing, detail, options));
    const records: NormalizedOpportunity[] = eligible.slice(offset, offset + requestedLimit).map(({ listing, detail }) => {
      const postedDate = detail.postedDate ?? listing.postedDate ?? UNKNOWN_DATE;
      const responseDeadline = detail.responseDeadline ?? listing.responseDeadline;
      const agency = detail.agency ?? listing.agency ?? this.source.buyerName;
      const solicitationNumber = listing.solicitationNumber ?? listing.nativeId;
      return {
        externalId: `${this.source.portalId}-${listing.nativeId.replace(/[^a-z0-9._-]+/gi, "-")}`,
        title: detail.title ?? listing.title,
        agency,
        subAgency: detail.subAgency ?? listing.subAgency,
        type: detail.type ?? listing.type ?? "Bid",
        status: "active",
        postedDate,
        responseDeadline,
        description: detail.description ?? listing.description,
        placeOfPerformance: detail.placeOfPerformance ?? this.source.state,
        solicitationNumber,
        sourceUrl: listing.detailUrl,
        source: "publicPortalProviders",
        providerName: "publicPortalProviders",
        rawData: {
          providerFamily: "official_public_portal",
          providerPlatform: this.source.platform,
          providerType: "statewide_public_listing_detail",
          discoveryMethod: "dedicated_official_adapter",
          sourceBadge: this.source.sourceBadge,
          sourceConfidence: "high",
          sourceId: this.source.portalId,
          nativeOpportunityId: listing.nativeId,
          solicitationNumber,
          issuingAgency: agency,
          issuingDepartment: detail.subAgency ?? listing.subAgency,
          listingUrl: this.source.listingUrl,
          canonicalUrl: listing.detailUrl,
          listingPage: listing.listingPage,
          category: detail.category ?? listing.category,
          contactName: detail.contactName,
          contactEmail: detail.contactEmail,
          contactPhone: detail.contactPhone,
          documentUrls: detail.documentUrls,
          dateUnknown: postedDate.getTime() === 0,
          deadlineUnknown: !responseDeadline,
          collectedAt: new Date().toISOString(),
        },
      };
    });

    this.recordCount = records.length;
    if (records.length > 0 || errors.length === 0) {
      this.lastSuccess = new Date();
      this.lastError = errors.length ? errors.join("; ") : undefined;
    } else {
      this.lastError = errors.join("; ") || `${this.source.portalId}: no public solicitation rows were parsed`;
    }
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

export function statewidePortalProvider(portalId: string): StatewidePortalProvider | undefined {
  const source = SOURCE_BY_ID.get(portalId);
  return source ? new StatewidePortalProvider(source) : undefined;
}

export const statewidePortalProviders: Record<string, StatewidePortalProvider> = Object.fromEntries(
  STATEWIDE_BATCH_2_SOURCES.map((source) => [source.portalId, new StatewidePortalProvider(source)]),
);
