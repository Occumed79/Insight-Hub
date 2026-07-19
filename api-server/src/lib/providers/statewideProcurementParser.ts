import { createHash } from "node:crypto";
import type { FetchOptions, NormalizedOpportunity } from "./types";
import {
  allowedStatewideUrl,
  type StatewidePortalConfig,
} from "./statewideProcurementConfigs";

const UNKNOWN_POSTED_DATE = new Date(0);
const CLOSED_STATUS = /\b(?:closed|awarded|cancelled|canceled|expired|withdrawn|completed|complete|inactive|pending selection|retracted|under evaluation)\b/i;
const ACTIVE_STATUS = /\b(?:open|active|posted|released|sent|amended|available|accepting responses?)\b/i;
const DOCUMENT_TEXT = /\b(?:attachment|addendum|addenda|amendment|specification|document|download|bid package|solicitation file|notice|scope of work|terms and conditions)\b/i;
const DOCUMENT_PATH = /\.(?:pdf|docx?|xlsx?|csv|zip|txt|rtf)(?:$|[?#])/i;
const NON_DETAIL_TEXT = /^(?:home|search|login|log in|register|next|previous|back|view all|more|details?|open|close|menu|select|print)$/i;
const DETAIL_PATH = /(?:solicitation|opportunit|event|bid|rfp|rfq|rfi|rfx|request|notice|project|details?|view|publicevent|bidpreview|bidcalendar|external\/bidDetail)/i;
const DISCOVERY_TEXT = /\b(?:open|current|active|all|public|state)\s+(?:bids?|solicitations?|opportunities|events|notices)|bid board|bidding opportunities|business opportunities|browse solicitations|view solicitations|public events|bid calendar|request for proposals|invitations? to bid|vendor bid system\b/i;
const DISCOVERY_PATH = /(?:bid[-_/ ]?(?:board|calendar|opportunit)|solicitation(?:s|search|Search)|opportunit|request_browse_public|publicevent|altselfservice|advantage4|sav-search|vendorresources|current-business-opportunities|open-and-future-solicitations|advancedSearchBid)/i;
const DISCOVERY_EXCLUDE = /\b(?:login|log in|register|registration|training|guide|faq|award|contract board|past|closed|archive|vendor profile)\b/i;
const ID_QUERY_KEYS = [
  "id", "bidid", "bid_id", "solicitationid", "solicitation_id", "eventid", "event_id",
  "rfpid", "rfp_id", "rfxid", "rfx_id", "requestid", "request_id", "noticeid",
  "notice_id", "opportunityid", "opportunity_id", "projectid", "project_id", "sid",
  "docid", "bidno", "bidid", "rfid", "projectid",
] as const;

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

interface Anchor {
  href: string;
  text: string;
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
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : "";
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
    .replace(/\b(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|ET|CT|MT|PT)\b/gi, "")
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
  if (!url.hash.startsWith("#/")) url.hash = "";
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

function extractAnchors(html: string, pageUrl: string, config: StatewidePortalConfig): Anchor[] {
  const anchors: Anchor[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const safe = allowedStatewideUrl(config, decodeHtml(match[1] ?? ""), pageUrl);
    if (!safe) continue;
    anchors.push({
      href: statewideCanonicalUrl(safe),
      text: statewideHtmlToText(match[2] ?? ""),
    });
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

function queryNativeId(url: URL): string | undefined {
  for (const [key, value] of url.searchParams) {
    if (ID_QUERY_KEYS.includes(key.toLowerCase() as (typeof ID_QUERY_KEYS)[number]) && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function extractNativeId(detailUrl: string, text: string): string {
  const url = new URL(detailUrl);
  const queryId = queryNativeId(url);
  if (queryId) return queryId;
  const guid = `${url.pathname} ${url.search} ${text}`.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0];
  if (guid) return guid;
  const labeled = text.match(/\b(?:solicitation|bid|rfp|rfq|rfi|rfx|event|project|notice|reference)\s*(?:number|no\.?|#|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})\b/i)?.[1];
  if (labeled) return labeled;
  const pathId = `${url.pathname}${url.hash}`.match(/\/(?:details?|view|bid|event|solicitation|opportunity|opportunities)\/([A-Z0-9._-]{3,})(?:\/|$|[?&#])/i)?.[1];
  return pathId || statewideStableHash(`${statewideCanonicalUrl(detailUrl)}|${text.trim().slice(0, 300)}`);
}

function inferType(text: string): string {
  const lower = text.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(lower)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotations?/.test(lower)) return "RFQ";
  if (/\brfi\b|request for information/.test(lower)) return "RFI";
  if (/\b(?:ifb|itb)\b|invitation (?:for|to) bids?/.test(lower)) return "Bid";
  if (/sole source/.test(lower)) return "Sole Source Notice";
  return "Solicitation";
}

function isActive(status: string | undefined, deadline: Date | undefined): boolean {
  return !CLOSED_STATUS.test(status ?? "") && !(deadline && deadline.getTime() < Date.now());
}

function headersIndex(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
}

function rowDocumentUrls(anchors: Anchor[]): string[] {
  return Array.from(new Set(anchors
    .filter((anchor) => DOCUMENT_PATH.test(new URL(anchor.href).pathname + new URL(anchor.href).search) || DOCUMENT_TEXT.test(anchor.text))
    .map((anchor) => anchor.href)));
}

function looksLikeDetail(anchor: Anchor): boolean {
  const url = new URL(anchor.href);
  return DETAIL_PATH.test(url.pathname + url.search + url.hash)
    || Boolean(queryNativeId(url))
    || (!NON_DETAIL_TEXT.test(anchor.text) && /\b(?:rfp|rfq|rfi|itb|ifb|bid|solicitation|event|project)\b/i.test(anchor.text));
}

function parseTableRecords(
  html: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord[] {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[0]);
  let headers: string[] = [];
  const records: StatewideListingRecord[] = [];
  for (const row of rows) {
    const cells = Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map((match) => statewideHtmlToText(match[1] ?? ""));
    if (!cells.length) continue;
    if (/<th\b/i.test(row) || (!headers.length && cells.some((cell) => /solicitation|bid|description|title|agency|department|status|date|event|project/i.test(cell)))) {
      headers = cells.map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
      continue;
    }
    const anchors = extractAnchors(row, pageUrl, config);
    const documents = rowDocumentUrls(anchors);
    const detailAnchor = anchors.find(looksLikeDetail);
    if (!detailAnchor && !documents.length) continue;
    const at = (index: number): string | undefined => index >= 0 ? cells[index]?.trim() || undefined : undefined;
    const titleColumn = headersIndex(headers, [/title/, /description/, /event name/, /project name/, /solicitation name/, /^name$/, /overview/, /subject/]);
    const numberColumn = headersIndex(headers, [/solicitation.*(?:number|no|id)/, /bid.*(?:number|no|id)/, /rfx/, /event.*(?:id|number)/, /project.*number/, /smart number/, /reference/]);
    const statusColumn = headersIndex(headers, [/status/]);
    const deadlineColumn = headersIndex(headers, [/submission/, /due date/, /closing/, /bid opening/, /response deadline/, /end date/, /close date/]);
    const postedColumn = headersIndex(headers, [/advertised/, /posted/, /publish/, /issue date/, /start date/, /created date/, /date prepared/]);
    const agencyColumn = headersIndex(headers, [/agency/, /department/, /organization/, /entity/, /buyer/]);
    const typeColumn = headersIndex(headers, [/type/, /category/]);
    const solicitationNumber = at(numberColumn);
    const status = at(statusColumn);
    const deadline = parseDate(at(deadlineColumn), true);
    if (!isActive(status, deadline)) continue;
    const fallbackTitle = cells.find((cell, index) => index !== numberColumn
      && index !== statusColumn
      && cell.length >= 6
      && !NON_DETAIL_TEXT.test(cell)
      && !/^(?:open|active|posted|sent|released)$/i.test(cell)
      && !/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(cell));
    const title = at(titleColumn)
      || (detailAnchor && !NON_DETAIL_TEXT.test(detailAnchor.text) ? detailAnchor.text : undefined)
      || fallbackTitle;
    if (!title || NON_DETAIL_TEXT.test(title)) continue;
    const detailUrl = detailAnchor?.href || documents[0] || pageUrl;
    const nativeId = solicitationNumber || extractNativeId(detailUrl, cells.join(" | "));
    const agency = at(agencyColumn) || config.buyerName;
    records.push({
      nativeId,
      title,
      agency,
      department: agency === config.buyerName ? undefined : agency,
      status,
      postedDate: parseDate(at(postedColumn)),
      responseDeadline: deadline,
      solicitationNumber: solicitationNumber || nativeId,
      type: at(typeColumn) || inferType(`${title} ${solicitationNumber ?? ""}`),
      detailUrl,
      documentUrls: documents,
      listingPage,
    });
  }
  return records;
}

function parseCardRecords(
  html: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord[] {
  const blocks = Array.from(html.matchAll(/<(?:article|li|section|div)\b[^>]*(?:class|id)=["'][^"']*(?:bid|solicitation|opportunit|event|procurement|notice|project|result|record)[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|li|section|div)>/gi))
    .map((match) => match[0]);
  const records: StatewideListingRecord[] = [];
  for (const block of blocks.length ? blocks : [html]) {
    const text = statewideHtmlToText(block);
    const anchors = extractAnchors(block, pageUrl, config);
    const documents = rowDocumentUrls(anchors);
    const candidates = anchors.filter(looksLikeDetail);
    for (const anchor of candidates) {
      const status = labelValue(text, ["Status", "Status Reason", "Event Status"]);
      const deadline = parseDate(labelValue(text, ["Due Date", "Closing Date", "Close Date", "Submission Date", "Bid Opening Date", "Response Deadline", "Event End Date"]), true);
      if (!isActive(status, deadline)) continue;
      const solicitationNumber = labelValue(text, ["Solicitation Number", "Solicitation/Project#", "Bid Number", "RFx Number", "Event ID", "Event Number", "Project Number", "Reference ID"]);
      const heading = Array.from(block.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi))
        .map((match) => statewideHtmlToText(match[1] ?? ""))
        .find((value) => value.length >= 6 && !NON_DETAIL_TEXT.test(value));
      const title = heading || (!NON_DETAIL_TEXT.test(anchor.text) ? anchor.text : undefined) || labelValue(text, ["Title", "Project Name", "Event Name", "Description"]);
      if (!title) continue;
      const nativeId = solicitationNumber || extractNativeId(anchor.href, text);
      records.push({
        nativeId,
        title,
        agency: labelValue(text, ["Department/Agency", "Agency", "Department", "Organization", "Buyer", "Issuing Entity"]) || config.buyerName,
        department: labelValue(text, ["Department/Agency", "Department", "Organization"]),
        status,
        postedDate: parseDate(labelValue(text, ["Posted Date", "Advertised Date", "Published Date", "Issue Date", "Start Date", "Date Open"])),
        responseDeadline: deadline,
        solicitationNumber: solicitationNumber || nativeId,
        type: labelValue(text, ["Solicitation Type", "RFx Type", "Advertisement Type", "Event Type"]) || inferType(`${title} ${solicitationNumber ?? ""}`),
        description: labelValue(text, ["Description", "Overview", "Scope"]),
        detailUrl: anchor.href,
        documentUrls: documents,
        listingPage,
      });
    }
  }
  return records;
}

function parseJsonRecords(
  value: unknown,
  config: StatewidePortalConfig,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord[] {
  const records: StatewideListingRecord[] = [];
  const seen = new Set<object>();
  let visited = 0;
  const normalized = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const valueFor = (object: Record<string, unknown>, keys: string[]): unknown => Object.entries(object).find(([key]) => keys.includes(normalized(key)))?.[1];
  const stringFor = (object: Record<string, unknown>, keys: string[]): string | undefined => {
    const found = valueFor(object, keys);
    if (typeof found === "string") return found.trim() || undefined;
    if (typeof found === "number") return String(found);
    return undefined;
  };
  const visit = (node: unknown): void => {
    if (visited >= 10_000 || node === null || typeof node !== "object" || seen.has(node as object)) return;
    seen.add(node as object);
    visited += 1;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    const object = node as Record<string, unknown>;
    const title = stringFor(object, ["title", "name", "projectname", "eventname", "solicitationtitle", "bidtitle", "projecttitle", "shortdescription"]);
    const description = stringFor(object, ["description", "summary", "scope", "projectdescription", "eventdescription"]);
    const id = stringFor(object, ["id", "projectid", "privateprojectid", "bidid", "eventid", "solicitationid", "opportunityid", "requestid", "noticeid", "rfxid"]);
    const href = stringFor(object, ["url", "href", "link", "detailurl", "publicurl", "solicitationurl", "projecturl"]);
    if (title && (id || href)) {
      let detailUrl = pageUrl;
      if (href) {
        detailUrl = allowedStatewideUrl(config, href, pageUrl) || pageUrl;
      } else if (config.platformFamily === "bonfire_euna" && id) {
        detailUrl = allowedStatewideUrl(config, `/opportunities/${encodeURIComponent(id)}`, config.listingUrl) || pageUrl;
      }
      const nativeId = id || extractNativeId(detailUrl, `${title} ${description ?? ""}`);
      const status = stringFor(object, ["status", "statusreason", "state", "projectstatus", "eventstatus"]);
      const deadline = parseDate(stringFor(object, ["dateclose", "duedate", "deadline", "closingdate", "submissiondate", "enddate", "openingdate"]), true);
      if (isActive(status, deadline)) {
        records.push({
          nativeId,
          title,
          agency: stringFor(object, ["agency", "department", "organization", "buyer", "entityname", "departmentname"]) || config.buyerName,
          department: stringFor(object, ["department", "organization", "subagency", "departmentname"]),
          status,
          postedDate: parseDate(stringFor(object, ["dateopen", "posteddate", "publisheddate", "advertiseddate", "issuedate", "startdate", "createddate"])),
          responseDeadline: deadline,
          solicitationNumber: stringFor(object, ["referenceid", "solicitationnumber", "bidnumber", "rfxnumber", "eventnumber", "projectnumber"]) || nativeId,
          type: stringFor(object, ["type", "solicitationtype", "rfxtype", "category", "eventtype"]) || inferType(`${title} ${description ?? ""}`),
          description,
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

function parseCsvRecords(
  content: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2 || !lines[0]?.includes(",")) return [];
  const split = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"' && quoted) { current += '"'; index += 1; continue; }
      if (character === '"') { quoted = !quoted; continue; }
      if (character === "," && !quoted) { cells.push(current.trim()); current = ""; continue; }
      current += character;
    }
    cells.push(current.trim());
    return cells;
  };
  const headers = split(lines[0] ?? "").map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  const idx = (patterns: RegExp[]): number => headersIndex(headers, patterns);
  const records: StatewideListingRecord[] = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const at = (index: number): string | undefined => index >= 0 ? cells[index]?.trim() || undefined : undefined;
    const title = at(idx([/title/, /description/, /event name/, /project name/]));
    const solicitationNumber = at(idx([/solicitation/, /bid number/, /event number/, /project number/, /reference/]));
    if (!title || !solicitationNumber) continue;
    const status = at(idx([/status/]));
    const deadline = parseDate(at(idx([/due/, /close/, /end date/, /opening/])), true);
    if (!isActive(status, deadline)) continue;
    const href = at(idx([/url/, /link/]));
    const detailUrl = href ? allowedStatewideUrl(config, href, pageUrl) || pageUrl : pageUrl;
    records.push({
      nativeId: solicitationNumber,
      title,
      agency: at(idx([/agency/, /department/, /organization/, /buyer/])) || config.buyerName,
      status,
      postedDate: parseDate(at(idx([/posted/, /publish/, /issue/, /start/]))),
      responseDeadline: deadline,
      solicitationNumber,
      type: at(idx([/type/, /category/])) || inferType(title),
      detailUrl,
      documentUrls: [],
      listingPage,
    });
  }
  return records;
}

export function parseStatewideListingContent(
  content: string,
  config: StatewidePortalConfig,
  pageUrl = config.listingUrl,
  listingPage = 1,
): StatewideListingRecord[] {
  const records: StatewideListingRecord[] = [];
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { records.push(...parseJsonRecords(JSON.parse(trimmed), config, pageUrl, listingPage)); } catch { /* HTML fallback */ }
  }
  for (const match of content.matchAll(/<script\b[^>]*type=["']application\/(?:ld\+json|json)["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { records.push(...parseJsonRecords(JSON.parse(decodeHtml(match[1] ?? "")), config, pageUrl, listingPage)); } catch { /* malformed data island */ }
  }
  if (!/<html|<table|<div|<article|<li|<section|<a\b/i.test(content) && content.includes(",")) {
    records.push(...parseCsvRecords(content, config, pageUrl, listingPage));
  }
  const tableRecords = parseTableRecords(content, config, pageUrl, listingPage);
  records.push(...tableRecords);
  if (!tableRecords.length) records.push(...parseCardRecords(content, config, pageUrl, listingPage));
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${config.portalId}:${record.nativeId}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractStatewideDiscoveryUrls(
  content: string,
  pageUrl: string,
  config: StatewidePortalConfig,
  limit = 24,
): string[] {
  const candidates: Anchor[] = extractAnchors(content, pageUrl, config);
  for (const match of content.matchAll(/<(?:iframe|frame)\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
    const safe = allowedStatewideUrl(config, decodeHtml(match[1] ?? ""), pageUrl);
    if (safe) candidates.push({ href: statewideCanonicalUrl(safe), text: "embedded bid board" });
  }
  const configuredPatterns = (config.discoveryLinkPatterns ?? []).map((value) => {
    try { return new RegExp(value, "i"); } catch { return undefined; }
  }).filter((value): value is RegExp => Boolean(value));
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const candidate of candidates) {
    if (urls.length >= limit) break;
    const url = new URL(candidate.href);
    const combined = `${candidate.text} ${url.pathname} ${url.search} ${url.hash}`;
    if (DOCUMENT_PATH.test(combined) || DISCOVERY_EXCLUDE.test(candidate.text)) continue;
    const configuredMatch = configuredPatterns.some((pattern) => pattern.test(combined));
    if (!configuredMatch && !DISCOVERY_TEXT.test(candidate.text) && !DISCOVERY_PATH.test(url.pathname + url.search + url.hash)) continue;
    const canonical = statewideCanonicalUrl(candidate.href);
    if (seen.has(canonical.toLowerCase())) continue;
    seen.add(canonical.toLowerCase());
    urls.push(canonical);
  }
  return urls;
}

export function parseStatewideDetailHtml(
  html: string,
  config: StatewidePortalConfig,
  detailUrl: string,
): StatewideDetailRecord {
  const text = statewideHtmlToText(html);
  const heading = Array.from(html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi))
    .map((match) => statewideHtmlToText(match[1] ?? ""))
    .find((value) => value && !/solicitation details|business opportunities|public solicitations|search|bid board/i.test(value));
  const documentUrls = new Set<string>();
  for (const anchor of extractAnchors(html, detailUrl, config)) {
    const url = new URL(anchor.href);
    if (DOCUMENT_PATH.test(url.pathname + url.search) || DOCUMENT_TEXT.test(anchor.text)) {
      documentUrls.add(statewideCanonicalUrl(anchor.href));
    }
  }
  return {
    title: heading || labelValue(text, ["Title", "Project Name", "Event Name", "Solicitation Title", "Description"]),
    agency: labelValue(text, ["Department/Agency", "Issuing Agency", "Agency", "Buyer Organization", "Department", "Organization"]),
    department: labelValue(text, ["Issuing Department", "Department/Agency", "Department", "Organization"]),
    status: labelValue(text, ["Status Reason", "Status", "Event Status"]),
    postedDate: parseDate(labelValue(text, ["Posted Date", "Advertised Date", "Published Date", "Date Prepared", "Issue Date", "Solicitation Start Date", "Date Open"])),
    responseDeadline: parseDate(labelValue(text, ["Solicitation Due Date", "Due Date", "Submission Date", "Closing Date", "Close Date", "Bid Opening Date", "Response Deadline", "Event End Date"]), true),
    solicitationNumber: labelValue(text, ["Solicitation Number", "Solicitation/Project#", "Bid Number", "RFx Number", "Event ID", "Event Number", "Project Number", "Reference ID"]),
    type: labelValue(text, ["Solicitation Type", "Advertisement Type", "RFx Type", "Event Type", "Type"]),
    description: labelValue(text, ["Description", "Scope", "Event Description", "Special Instructions", "Overview"]),
    contactName: labelValue(text, ["Buyer", "Contact Name", "Contact", "Purchaser"]),
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
  if (options.dateRange && record.postedDate.getTime() > 0 && record.postedDate.getTime() < Date.now() - options.dateRange * 86_400_000) {
    return false;
  }
  return true;
}

export function statewideToOpportunity(
  config: StatewidePortalConfig,
  listing: StatewideListingRecord,
  detail?: StatewideDetailRecord,
): NormalizedOpportunity | undefined {
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
      platformFamily: config.platformFamily,
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
      tags: [
        "direct-official-portal",
        `state:${config.state}`,
        `portal:${config.portalId}`,
        `platform-family:${config.platformFamily}`,
        ...(!postedDate ? ["date-unknown"] : []),
        ...(!deadline ? ["deadline-unknown"] : []),
      ],
    },
  };
}

export function statewideContentLooksLikeChallenge(content: string): boolean {
  const text = statewideHtmlToText(content).toLowerCase();
  return /(?:captcha|browser check|enable javascript|access denied|checking your browser|verify you are human|requires you to login)/.test(text)
    && !ACTIVE_STATUS.test(text);
}
