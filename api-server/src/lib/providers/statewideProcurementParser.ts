import { createHash } from "node:crypto";
import type { FetchOptions, NormalizedOpportunity } from "./types";
import { sameOriginUrl } from "./officialPortalHttp";
import type { StatewidePortalConfig } from "./statewideProcurementConfigs";

const UNKNOWN_POSTED_DATE = new Date(0);
const CLOSED_STATUS = /\b(?:closed|awarded|cancelled|canceled|expired|withdrawn|completed|complete|inactive|pending selection)\b/i;
const DOCUMENT_TEXT = /\b(?:attachment|addendum|addenda|amendment|specification|document|download|bid package|solicitation file|notice)\b/i;
const DOCUMENT_PATH = /\.(?:pdf|docx?|xlsx?|csv|zip|txt|rtf)(?:$|[?#])/i;
const NON_DETAIL_TEXT = /^(?:home|search|login|log in|register|next|previous|back|view all|more|details?|open|close|menu)$/i;
const DETAIL_PATH = /(?:solicitation|opportunit|event|bid|rfp|rfx|request|notice|project|details?|view)/i;
const ID_QUERY_KEYS = ["id", "bidid", "bid_id", "solicitationid", "solicitation_id", "eventid", "event_id", "rfpid", "rfp_id", "rfxid", "rfx_id", "requestid", "request_id", "noticeid", "notice_id", "opportunityid", "opportunity_id", "projectid", "project_id", "sid", "docid", "bidno"] as const;

export interface StatewideListingRecord {
  nativeId: string;
  title: string;
  agency: string;
  department?: string;
  status?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  solicitationNumber?: string;
  type?: string;
  description?: string;
  detailUrl: string;
  documentUrls: string[];
  listingPage: number;
}

export interface StatewideDetailRecord {
  title?: string;
  agency?: string;
  department?: string;
  status?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  solicitationNumber?: string;
  type?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  commodity?: string;
  placeOfPerformance?: string;
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
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const parsed = Number(code);
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : "";
    });
}

export function statewideHtmlToText(value: string): string {
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

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/\b(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const dateOnly = /^\d{4}-\d{1,2}-\d{1,2}$/.test(cleaned)
    || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(cleaned)
    || /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(cleaned);
  const parsed = new Date(endOfDay && dateOnly ? `${cleaned} 23:59:59.999` : cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function statewideStableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

export function statewideCanonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}

function extractAnchors(html: string, pageUrl: string, origin: string): Array<{ href: string; text: string }> {
  const anchors: Array<{ href: string; text: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeHtml(match[1] ?? ""), pageUrl);
      if (url.origin !== origin) continue;
      anchors.push({ href: statewideCanonicalUrl(url.toString()), text: statewideHtmlToText(match[2] ?? "") });
    } catch {
      // Ignore malformed links exposed by public pages.
    }
  }
  return anchors;
}

function labelValue(text: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(?:^|\\n|\\|)\\s*${escaped}\\s*[:*]?\\s*(?:\\n\\s*)?([^\\n|]+)`, "i"));
    const value = match?.[1]?.trim();
    if (value && value !== "*") return value;
  }
  return undefined;
}

function extractNativeId(detailUrl: string, text: string): string {
  const url = new URL(detailUrl);
  for (const [key, value] of url.searchParams) {
    if (ID_QUERY_KEYS.includes(key.toLowerCase() as (typeof ID_QUERY_KEYS)[number]) && value.trim()) return value.trim();
  }
  const guid = `${url.pathname} ${url.search} ${text}`.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0];
  if (guid) return guid;
  const labeled = text.match(/\b(?:solicitation|bid|rfp|rfq|rfi|rfx|event|project|notice)\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\/-]{3,})\b/i)?.[1];
  if (labeled) return labeled;
  return url.pathname.match(/\/(?:details?|view|bid|event|solicitation|opportunity)\/([A-Z0-9._-]{4,})(?:\/|$)/i)?.[1]
    || statewideStableHash(statewideCanonicalUrl(detailUrl));
}

function inferType(text: string): string {
  const lower = text.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(lower)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotations?/.test(lower)) return "RFQ";
  if (/\brfi\b|request for information/.test(lower)) return "RFI";
  if (/\bifb\b|invitation (?:for|to) bids?/.test(lower)) return "Bid";
  if (/sole source/.test(lower)) return "Sole Source Notice";
  return "Solicitation";
}

function isActive(status: string | undefined, deadline: Date | undefined): boolean {
  return !CLOSED_STATUS.test(status ?? "") && !(deadline && deadline.getTime() < Date.now());
}

function parseTableRecords(html: string, config: StatewidePortalConfig, pageUrl: string, listingPage: number): StatewideListingRecord[] {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[0]);
  let headers: string[] = [];
  const records: StatewideListingRecord[] = [];
  for (const row of rows) {
    const cells = Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((match) => statewideHtmlToText(match[1] ?? ""));
    if (!cells.length) continue;
    if (/<th\b/i.test(row) || (!headers.length && cells.some((cell) => /solicitation|bid|description|title|agency|department|status|date/i.test(cell)))) {
      headers = cells.map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
      continue;
    }
    const anchors = extractAnchors(row, pageUrl, config.origin);
    const anchor = anchors.find((item) => {
      const url = new URL(item.href);
      return DETAIL_PATH.test(url.pathname + url.search) || ID_QUERY_KEYS.some((key) => url.searchParams.has(key));
    }) ?? anchors.find((item) => item.text.length >= 8 && !NON_DETAIL_TEXT.test(item.text));
    if (!anchor) continue;
    const idx = (patterns: RegExp[]) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    const at = (index: number) => index >= 0 ? cells[index]?.trim() || undefined : undefined;
    const cellTitle = at(idx([/title/, /description/, /event name/, /project name/, /solicitation name/, /^name$/]));
    const fallbackTitle = cells.find((cell) => cell.length >= 8 && !NON_DETAIL_TEXT.test(cell) && !/^open|active|posted$/i.test(cell));
    const title = cellTitle || (!NON_DETAIL_TEXT.test(anchor.text) ? anchor.text : fallbackTitle);
    if (!title || NON_DETAIL_TEXT.test(title)) continue;
    const solicitationNumber = at(idx([/solicitation.*(?:number|no)/, /bid.*(?:number|no)/, /rfx/, /event.*(?:id|number)/, /project.*number/, /smart number/]));
    const status = at(idx([/status/]));
    const deadline = parseDate(at(idx([/submission/, /due date/, /closing/, /open(?:ing)? date/, /response deadline/, /end date/])), true);
    if (!isActive(status, deadline)) continue;
    const agency = at(idx([/agency/, /department/, /organization/, /entity/, /buyer/])) || config.buyerName;
    const nativeId = extractNativeId(anchor.href, `${solicitationNumber ?? ""} ${cells.join(" | ")}`);
    records.push({
      nativeId,
      title,
      agency,
      department: agency === config.buyerName ? undefined : agency,
      status,
      postedDate: parseDate(at(idx([/advertised/, /posted/, /publish/, /issue date/, /start date/, /date prepared/]))),
      responseDeadline: deadline,
      solicitationNumber: solicitationNumber || nativeId,
      type: at(idx([/type/, /category/])) || inferType(title),
      detailUrl: anchor.href,
      documentUrls: [],
      listingPage,
    });
  }
  return records;
}

function parseCardRecords(html: string, config: StatewidePortalConfig, pageUrl: string, listingPage: number): StatewideListingRecord[] {
  const blocks = Array.from(html.matchAll(/<(?:article|li|section|div)\b[^>]*(?:class|id)=["'][^"']*(?:bid|solicitation|opportunit|event|procurement|notice|project|result|record)[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|li|section|div)>/gi)).map((match) => match[0]);
  const records: StatewideListingRecord[] = [];
  for (const block of blocks.length ? blocks : [html]) {
    const text = statewideHtmlToText(block);
    for (const anchor of extractAnchors(block, pageUrl, config.origin)) {
      if (!anchor.text || anchor.text.length < 8 || NON_DETAIL_TEXT.test(anchor.text)) continue;
      const url = new URL(anchor.href);
      if (!DETAIL_PATH.test(url.pathname + url.search) && !ID_QUERY_KEYS.some((key) => url.searchParams.has(key))) continue;
      const status = labelValue(text, ["Status", "Status Reason"]);
      const deadline = parseDate(labelValue(text, ["Due Date", "Closing Date", "Submission Date", "Opening Date", "Response Deadline", "Event End Date"]), true);
      if (!isActive(status, deadline)) continue;
      const solicitationNumber = labelValue(text, ["Solicitation Number", "Solicitation/Project#", "Bid Number", "RFx Number", "Event ID", "Project Number"]);
      const nativeId = extractNativeId(anchor.href, `${solicitationNumber ?? ""} ${text}`);
      records.push({
        nativeId,
        title: anchor.text,
        agency: labelValue(text, ["Department/Agency", "Agency", "Department", "Organization", "Buyer"]) || config.buyerName,
        department: labelValue(text, ["Department/Agency", "Department", "Organization"]),
        status,
        postedDate: parseDate(labelValue(text, ["Posted Date", "Advertised Date", "Published Date", "Issue Date", "Start Date"])),
        responseDeadline: deadline,
        solicitationNumber: solicitationNumber || nativeId,
        type: labelValue(text, ["Solicitation Type", "RFx Type", "Advertisement Type"]) || inferType(anchor.text),
        description: labelValue(text, ["Description"]),
        detailUrl: anchor.href,
        documentUrls: [],
        listingPage,
      });
    }
  }
  return records;
}

function parseJsonRecords(value: unknown, config: StatewidePortalConfig, pageUrl: string, listingPage: number): StatewideListingRecord[] {
  const records: StatewideListingRecord[] = [];
  const seen = new Set<object>();
  let visited = 0;
  const normalized = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const valueFor = (object: Record<string, unknown>, keys: string[]) => Object.entries(object).find(([key]) => keys.includes(normalized(key)))?.[1];
  const stringFor = (object: Record<string, unknown>, keys: string[]) => {
    const found = valueFor(object, keys);
    return typeof found === "string" ? found.trim() || undefined : typeof found === "number" ? String(found) : undefined;
  };
  const visit = (node: unknown): void => {
    if (visited >= 5_000 || node === null || typeof node !== "object" || seen.has(node as object)) return;
    seen.add(node as object);
    visited += 1;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    const object = node as Record<string, unknown>;
    const title = stringFor(object, ["title", "name", "description", "eventname", "solicitationtitle", "bidtitle", "projecttitle"]);
    const id = stringFor(object, ["id", "bidid", "eventid", "solicitationid", "opportunityid", "requestid", "noticeid", "projectid", "rfxid"]);
    const href = stringFor(object, ["url", "href", "link", "detailurl", "publicurl", "solicitationurl"]);
    if (title && (id || href)) {
      let detailUrl = pageUrl;
      if (href) {
        try {
          const candidate = new URL(href, pageUrl);
          if (candidate.origin === config.origin) detailUrl = statewideCanonicalUrl(candidate.toString());
        } catch {
          // Ignore malformed public JSON links.
        }
      }
      const nativeId = id || extractNativeId(detailUrl, title);
      const status = stringFor(object, ["status", "statusreason", "state"]);
      const deadline = parseDate(stringFor(object, ["duedate", "deadline", "closingdate", "submissiondate", "enddate", "openingdate"]), true);
      if (isActive(status, deadline)) {
        records.push({
          nativeId,
          title,
          agency: stringFor(object, ["agency", "department", "organization", "buyer", "entityname"]) || config.buyerName,
          department: stringFor(object, ["department", "organization", "subagency"]),
          status,
          postedDate: parseDate(stringFor(object, ["posteddate", "publisheddate", "advertiseddate", "issuedate", "startdate"])),
          responseDeadline: deadline,
          solicitationNumber: stringFor(object, ["solicitationnumber", "bidnumber", "rfxnumber", "eventnumber", "projectnumber"]) || nativeId,
          type: stringFor(object, ["type", "solicitationtype", "rfxtype", "category"]) || inferType(title),
          description: stringFor(object, ["description", "summary", "scope"]),
          detailUrl,
          documentUrls: [],
          listingPage,
        });
      }
    }
    for (const child of Object.values(object)) visit(child);
  };
  visit(value);
  return records;
}

export function parseStatewideListingContent(content: string, config: StatewidePortalConfig, pageUrl = config.listingUrl, listingPage = 1): StatewideListingRecord[] {
  const records: StatewideListingRecord[] = [];
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { records.push(...parseJsonRecords(JSON.parse(trimmed), config, pageUrl, listingPage)); } catch { /* HTML fallback */ }
  }
  for (const match of content.matchAll(/<script\b[^>]*type=["']application\/(?:ld\+json|json)["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { records.push(...parseJsonRecords(JSON.parse(decodeHtml(match[1] ?? "")), config, pageUrl, listingPage)); } catch { /* malformed data island */ }
  }
  records.push(...parseTableRecords(content, config, pageUrl, listingPage), ...parseCardRecords(content, config, pageUrl, listingPage));
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${config.portalId}:${record.nativeId}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseStatewideDetailHtml(html: string, config: StatewidePortalConfig, detailUrl: string): StatewideDetailRecord {
  const text = statewideHtmlToText(html);
  const heading = Array.from(html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi))
    .map((match) => statewideHtmlToText(match[1] ?? ""))
    .find((value) => value && !/solicitation details|business opportunities|public solicitations|search/i.test(value));
  const documentUrls = new Set<string>();
  for (const anchor of extractAnchors(html, detailUrl, config.origin)) {
    const url = new URL(anchor.href);
    if (DOCUMENT_PATH.test(url.pathname + url.search) || DOCUMENT_TEXT.test(anchor.text)) {
      const safe = sameOriginUrl(anchor.href, config.origin);
      if (safe) documentUrls.add(statewideCanonicalUrl(safe));
    }
  }
  return {
    title: heading,
    agency: labelValue(text, ["Department/Agency", "Issuing Agency", "Agency", "Buyer Organization", "Department"]),
    department: labelValue(text, ["Issuing Department", "Department/Agency", "Department", "Organization"]),
    status: labelValue(text, ["Status Reason", "Status"]),
    postedDate: parseDate(labelValue(text, ["Posted Date", "Advertised Date", "Published Date", "Date Prepared", "Issue Date", "Solicitation Start Date"])),
    responseDeadline: parseDate(labelValue(text, ["Solicitation Due Date", "Due Date", "Submission Date", "Closing Date", "Opening Date", "Response Deadline", "Event End Date"]), true),
    solicitationNumber: labelValue(text, ["Solicitation Number", "Solicitation/Project#", "Bid Number", "RFx Number", "Event ID", "Project Number"]),
    type: labelValue(text, ["Solicitation Type", "Advertisement Type", "RFx Type", "Type"]),
    description: labelValue(text, ["Description", "Scope", "Event Description", "Special Instructions"]),
    contactName: labelValue(text, ["Buyer", "Contact Name", "Contact"]),
    contactEmail: text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0],
    contactPhone: text.match(/(?:\+?1[ .\/-]?)?\(?\d{3}\)?[ .\/-]\d{3}[ .\/-]\d{4}(?:\s*(?:x|ext\.?)\s*\d+)?/i)?.[0],
    commodity: labelValue(text, ["Primary Commodity Code", "Commodity", "Category", "NIGP Code", "UNSPSC"]),
    placeOfPerformance: labelValue(text, ["Delivery Location", "Location", "County", "Place of Performance"]),
    documentUrls: Array.from(documentUrls),
  };
}

export function statewideMatchesOptions(record: NormalizedOpportunity, options: FetchOptions): boolean {
  const keywords = options.keywords?.toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords?.length) {
    const haystack = [record.title, record.agency, record.subAgency, record.description, record.solicitationNumber, record.naicsDescription]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!keywords.some((keyword) => haystack.includes(keyword))) return false;
  }
  if (options.dateRange && record.postedDate.getTime() > 0 && record.postedDate.getTime() < Date.now() - options.dateRange * 86_400_000) return false;
  return true;
}

export function statewideToOpportunity(config: StatewidePortalConfig, listing: StatewideListingRecord, detail?: StatewideDetailRecord): NormalizedOpportunity | undefined {
  const deadline = detail?.responseDeadline ?? listing.responseDeadline;
  const status = detail?.status ?? listing.status;
  if (!isActive(status, deadline)) return undefined;
  const postedDate = detail?.postedDate ?? listing.postedDate;
  const agency = detail?.agency?.trim() || listing.agency || config.buyerName;
  const department = detail?.department?.trim() || listing.department;
  const title = detail?.title?.trim() || listing.title;
  const solicitationNumber = detail?.solicitationNumber || listing.solicitationNumber || listing.nativeId;
  const canonical = statewideCanonicalUrl(listing.detailUrl);
  const documentUrls = Array.from(new Set([...listing.documentUrls, ...(detail?.documentUrls ?? [])]));
  return {
    externalId: `${config.portalId}-${listing.nativeId.replace(/[^a-z0-9._-]/gi, "-")}`,
    title,
    agency,
    subAgency: department,
    type: detail?.type || listing.type || inferType(title),
    status: "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline: deadline,
    placeOfPerformance: detail?.placeOfPerformance || config.state,
    description: detail?.description || listing.description,
    solicitationNumber,
    sourceUrl: canonical,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: config.platform,
      providerType: "statewide_public_listing_detail",
      connectorName: `${config.sourceBadge} dedicated adapter`,
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: config.sourceBadge,
      sourceConfidence: "high",
      sourceId: config.portalId,
      nativeOpportunityId: listing.nativeId,
      solicitationNumber,
      issuingAgency: agency,
      issuingDepartment: department,
      listingUrl: config.listingUrl,
      canonicalUrl: canonical,
      listingPage: listing.listingPage,
      documentUrls,
      contactName: detail?.contactName,
      contactEmail: detail?.contactEmail,
      contactPhone: detail?.contactPhone,
      commodity: detail?.commodity,
      dateUnknown: !postedDate,
      deadlineUnknown: !deadline,
      collectedAt: new Date().toISOString(),
      tags: ["direct-official-portal", `state:${config.state}`, `portal:${config.portalId}`, ...(!postedDate ? ["date-unknown"] : []), ...(!deadline ? ["deadline-unknown"] : [])],
    },
  };
}
