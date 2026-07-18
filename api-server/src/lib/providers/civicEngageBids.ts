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
  fetchOfficialPortalText,
  positiveIntegerEnv,
  sameOriginUrl,
} from "./officialPortalHttp";

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_MAX_RESULTS_PER_TENANT = 50;
const DEFAULT_TENANT_CONCURRENCY = 3;
const DEFAULT_DETAIL_CONCURRENCY = 3;
const UNKNOWN_POSTED_DATE = new Date(0);
const CLOSED_STATUS = /\b(?:closed|awarded|cancelled|canceled|expired|complete|completed)\b/i;
const GENERIC_LINK_TEXT = /^(?:view|view bid|details|more|read more|open|click here)$/i;
const DOCUMENT_TEXT = /\b(?:attachment|addendum|addenda|specification|specifications|document|notice|bid packet|proposal packet|download)\b/i;
const DOCUMENT_PATH = /\.(?:pdf|docx?|xlsx?|csv|zip|txt)(?:$|[?#])/i;

export interface CivicEngageTenant {
  portalId: string;
  buyerName: string;
  state: string;
  listingUrl: string;
  origin: string;
}

export const CIVICENGAGE_TENANTS: CivicEngageTenant[] = [
  { portalId: "ca-alpine-county", buyerName: "Alpine County", state: "CA", listingUrl: "https://www.alpinecountyca.gov/bids.aspx", origin: "https://www.alpinecountyca.gov" },
  { portalId: "ca-colusa-county", buyerName: "Colusa County", state: "CA", listingUrl: "https://www.countyofcolusaca.gov/bids.aspx", origin: "https://www.countyofcolusaca.gov" },
  { portalId: "ca-humboldt-county", buyerName: "Humboldt County", state: "CA", listingUrl: "https://humboldtgov.org/bids.aspx", origin: "https://humboldtgov.org" },
  { portalId: "ca-lake-county", buyerName: "Lake County", state: "CA", listingUrl: "https://www.lakecountyca.gov/bids.aspx", origin: "https://www.lakecountyca.gov" },
  { portalId: "ca-lassen-county", buyerName: "Lassen County", state: "CA", listingUrl: "https://www.lassencounty.gov/bids.aspx", origin: "https://www.lassencounty.gov" },
  { portalId: "ca-mariposa-county", buyerName: "Mariposa County", state: "CA", listingUrl: "https://www.mariposacounty.gov/bids.aspx", origin: "https://www.mariposacounty.gov" },
  { portalId: "ca-merced-county", buyerName: "Merced County", state: "CA", listingUrl: "https://www.countyofmerced.com/bids.aspx", origin: "https://www.countyofmerced.com" },
  { portalId: "ca-modoc-county", buyerName: "Modoc County", state: "CA", listingUrl: "https://www.countyofmodoc.gov/Bids.aspx", origin: "https://www.countyofmodoc.gov" },
  { portalId: "ca-napa-county", buyerName: "Napa County", state: "CA", listingUrl: "https://www.napacounty.gov/bids.aspx", origin: "https://www.napacounty.gov" },
  { portalId: "ca-nevada-county", buyerName: "Nevada County", state: "CA", listingUrl: "https://www.nevadacountyca.gov/bids.aspx", origin: "https://www.nevadacountyca.gov" },
  { portalId: "ca-plumas-county", buyerName: "Plumas County", state: "CA", listingUrl: "https://www.plumascounty.us/bids.aspx", origin: "https://www.plumascounty.us" },
  { portalId: "ca-sierra-county", buyerName: "Sierra County", state: "CA", listingUrl: "https://www.sierracounty.ca.gov/bids.aspx", origin: "https://www.sierracounty.ca.gov" },
  { portalId: "ca-trinity-county", buyerName: "Trinity County", state: "CA", listingUrl: "https://www.trinitycounty.org/Bids.aspx", origin: "https://www.trinitycounty.org" },
  { portalId: "or-clatsop-county", buyerName: "Clatsop County", state: "OR", listingUrl: "https://www.clatsopcounty.gov/bids.aspx", origin: "https://www.clatsopcounty.gov" },
  { portalId: "or-crook-county", buyerName: "Crook County", state: "OR", listingUrl: "https://crookcountyor.gov/bids.aspx", origin: "https://crookcountyor.gov" },
  { portalId: "or-grant-county", buyerName: "Grant County", state: "OR", listingUrl: "https://grantcountyoregon.net/Bids.aspx", origin: "https://grantcountyoregon.net" },
  { portalId: "or-klamath-county", buyerName: "Klamath County", state: "OR", listingUrl: "https://www.klamathcounty.org/bids.aspx", origin: "https://www.klamathcounty.org" },
  { portalId: "or-lincoln-county", buyerName: "Lincoln County", state: "OR", listingUrl: "https://www.co.lincoln.or.us/Bids.aspx", origin: "https://www.co.lincoln.or.us" },
  { portalId: "or-yamhill-county", buyerName: "Yamhill County", state: "OR", listingUrl: "https://www.yamhillcounty.gov/Bids.aspx", origin: "https://www.yamhillcounty.gov" },
  { portalId: "wa-adams-county", buyerName: "Adams County", state: "WA", listingUrl: "https://www.co.adams.wa.gov/Bids.aspx", origin: "https://www.co.adams.wa.gov" },
  { portalId: "wa-asotin-county", buyerName: "Asotin County", state: "WA", listingUrl: "https://www.asotincountywa.gov/bids.aspx", origin: "https://www.asotincountywa.gov" },
  { portalId: "wa-clallam-county", buyerName: "Clallam County", state: "WA", listingUrl: "https://www.clallamcountywa.gov/Bids.aspx", origin: "https://www.clallamcountywa.gov" },
  { portalId: "wa-columbia-county", buyerName: "Columbia County", state: "WA", listingUrl: "https://www.columbiaco.com/Bids.aspx", origin: "https://www.columbiaco.com" },
  { portalId: "wa-cowlitz-county", buyerName: "Cowlitz County", state: "WA", listingUrl: "https://www.co.cowlitz.wa.us/Bids.aspx?CatID=All&Status=&showAllBids=on&txtSort=Date", origin: "https://www.co.cowlitz.wa.us" },
  { portalId: "wa-franklin-county", buyerName: "Franklin County", state: "WA", listingUrl: "https://franklincountywa.gov/Bids.aspx?CatID=19", origin: "https://franklincountywa.gov" },
  { portalId: "wa-island-county", buyerName: "Island County", state: "WA", listingUrl: "https://www.islandcountywa.gov/Bids.aspx", origin: "https://www.islandcountywa.gov" },
  { portalId: "wa-jefferson-county", buyerName: "Jefferson County", state: "WA", listingUrl: "https://www.co.jefferson.wa.us/Bids.aspx", origin: "https://www.co.jefferson.wa.us" },
  { portalId: "wa-klickitat-county", buyerName: "Klickitat County", state: "WA", listingUrl: "https://www.klickitatcounty.org/Bids.aspx", origin: "https://www.klickitatcounty.org" },
  { portalId: "wa-okanogan-county", buyerName: "Okanogan County", state: "WA", listingUrl: "https://www.okanogancounty.gov/bids.aspx", origin: "https://www.okanogancounty.gov" },
  { portalId: "wa-whatcom-county", buyerName: "Whatcom County", state: "WA", listingUrl: "https://www.whatcomcounty.us/Bids.aspx", origin: "https://www.whatcomcounty.us" },
  { portalId: "wa-whitman-county", buyerName: "Whitman County", state: "WA", listingUrl: "https://www.whitmancounty.gov/Bids.aspx", origin: "https://www.whitmancounty.gov" },
  { portalId: "tn-coffee-county", buyerName: "Coffee County", state: "TN", listingUrl: "https://www.coffeecountytn.gov/Bids.aspx", origin: "https://www.coffeecountytn.gov" },
  { portalId: "tn-madison-county", buyerName: "Madison County", state: "TN", listingUrl: "https://www.madisoncountytn.gov/Bids.aspx", origin: "https://www.madisoncountytn.gov" },
  { portalId: "tn-maury-county", buyerName: "Maury County", state: "TN", listingUrl: "https://www.maurycounty-tn.gov/Bids.aspx", origin: "https://www.maurycounty-tn.gov" },
  { portalId: "tn-washington-county", buyerName: "Washington County", state: "TN", listingUrl: "https://www.washingtoncountytn.org/Bids.aspx", origin: "https://www.washingtoncountytn.org" },
  { portalId: "tn-wilson-county", buyerName: "Wilson County", state: "TN", listingUrl: "https://www.wilsoncountytn.gov/Bids.aspx", origin: "https://www.wilsoncountytn.gov" },
  { portalId: "ny-cayuga-county", buyerName: "Cayuga County", state: "NY", listingUrl: "https://www.cayugacounty.gov/Bids.aspx", origin: "https://www.cayugacounty.gov" },
  { portalId: "ny-chemung-county", buyerName: "Chemung County", state: "NY", listingUrl: "https://www.chemungcountyny.gov/Bids.aspx", origin: "https://www.chemungcountyny.gov" },
  { portalId: "ny-columbia-county", buyerName: "Columbia County", state: "NY", listingUrl: "https://www.columbiacountyny.gov/Bids.aspx", origin: "https://www.columbiacountyny.gov" },
  { portalId: "ny-cortland-county", buyerName: "Cortland County", state: "NY", listingUrl: "https://www.cortlandcountyny.gov/Bids.aspx", origin: "https://www.cortlandcountyny.gov" },
  { portalId: "ny-livingston-county", buyerName: "Livingston County", state: "NY", listingUrl: "https://www.livingstoncountyny.gov/Bids.aspx", origin: "https://www.livingstoncountyny.gov" },
  { portalId: "ny-madison-county", buyerName: "Madison County", state: "NY", listingUrl: "https://www.madisoncounty.ny.gov/Bids.aspx", origin: "https://www.madisoncounty.ny.gov" },
  { portalId: "ny-ontario-county", buyerName: "Ontario County", state: "NY", listingUrl: "https://www.ontariocountyny.gov/Bids.aspx", origin: "https://www.ontariocountyny.gov" },
  { portalId: "ny-orange-county", buyerName: "Orange County", state: "NY", listingUrl: "https://www.orangecountygov.com/Bids.aspx", origin: "https://www.orangecountygov.com" },
  { portalId: "ny-rensselaer-county", buyerName: "Rensselaer County", state: "NY", listingUrl: "https://www.rensco.com/Bids.aspx", origin: "https://www.rensco.com" },
  { portalId: "ny-schuyler-county", buyerName: "Schuyler County", state: "NY", listingUrl: "https://www.schuylercountyny.gov/Bids.aspx", origin: "https://www.schuylercountyny.gov" },
  { portalId: "ny-steuben-county", buyerName: "Steuben County", state: "NY", listingUrl: "https://www.steubencountyny.gov/Bids.aspx", origin: "https://www.steubencountyny.gov" },
  { portalId: "ny-washington-county", buyerName: "Washington County", state: "NY", listingUrl: "https://www.washingtoncountyny.gov/Bids.aspx", origin: "https://www.washingtoncountyny.gov" },
  { portalId: "ny-wyoming-county", buyerName: "Wyoming County", state: "NY", listingUrl: "https://www.wyomingcountyny.gov/Bids.aspx", origin: "https://www.wyomingcountyny.gov" },
  { portalId: "ny-yates-county", buyerName: "Yates County", state: "NY", listingUrl: "https://www.yatescountyny.gov/Bids.aspx", origin: "https://www.yatescountyny.gov" },
];

export const CIVICENGAGE_PORTAL_IDS = new Set(
  CIVICENGAGE_TENANTS.map((tenant) => tenant.portalId),
);

export const CIVICENGAGE_TENANT_BY_PORTAL_ID = new Map(
  CIVICENGAGE_TENANTS.map((tenant) => [tenant.portalId, tenant]),
);

interface CivicEngageListingRecord {
  nativeBidId: string;
  title: string;
  canonicalUrl: string;
  solicitationNumber?: string;
  category?: string;
  status?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  listingText: string;
  listingPage: number;
}

interface CivicEngageDetail {
  title?: string;
  solicitationNumber?: string;
  category?: string;
  status?: string;
  postedDate?: Date;
  openingDate?: Date;
  responseDeadline?: Date;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  preBidInformation?: string;
  documentUrls: string[];
}

interface TenantCollectionResult {
  records: NormalizedOpportunity[];
  errors: string[];
}

interface AnchorMatch {
  href: string;
  text: string;
  index: number;
  endIndex: number;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2F;/gi, "/")
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

function canonicalUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = "";
  return parsed.toString();
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function queryValueCaseInsensitive(url: URL, names: readonly string[]): string | undefined {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of url.searchParams.entries()) {
    if (wanted.has(key.toLowerCase()) && value.trim()) return value.trim();
  }
  return undefined;
}

function nativeBidIdFromUrl(url: URL): string {
  const explicit = queryValueCaseInsensitive(url, ["BidID", "BidId", "bidid", "bid", "ID"]);
  if (explicit) return explicit.replace(/[^a-z0-9._-]/gi, "-");
  const pathMatch = url.pathname.match(/(?:bid|posting|solicitation)[-_\/]?(\d{2,})/i);
  if (pathMatch?.[1]) return pathMatch[1];
  return stableHash(canonicalUrl(url.toString()));
}

function isBidDetailUrl(url: URL, listingUrl: string): boolean {
  const path = url.pathname.toLowerCase();
  const hasBidId = Boolean(queryValueCaseInsensitive(url, ["BidID", "BidId", "bidid", "bid"]));
  if (hasBidId && /bids?\.aspx$/.test(path)) return true;
  if (/bid(?:details?|posting)\.aspx$/.test(path)) return true;
  const listing = new URL(listingUrl);
  return hasBidId && path === listing.pathname.toLowerCase();
}

function extractAnchors(html: string): AnchorMatch[] {
  const anchors: AnchorMatch[] = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    anchors.push({
      href: decodeHtml(match[1] ?? "").trim(),
      text: htmlToText(match[2] ?? ""),
      index: match.index ?? 0,
      endIndex: (match.index ?? 0) + match[0].length,
    });
  }
  return anchors;
}

function enclosingListingBlock(html: string, anchor: AnchorMatch): string {
  const tags = ["tr", "li", "article", "section"];
  for (const tag of tags) {
    const opening = html.toLowerCase().lastIndexOf(`<${tag}`, anchor.index);
    if (opening < 0) continue;
    const closing = html.toLowerCase().indexOf(`</${tag}>`, anchor.endIndex);
    if (closing > anchor.endIndex && closing - opening <= 12_000) {
      return html.slice(opening, closing + tag.length + 3);
    }
  }
  const start = Math.max(0, anchor.index - 1_000);
  const end = Math.min(html.length, anchor.endIndex + 1_500);
  return html.slice(start, end);
}

function firstLabelValue(text: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*${label}\\s*:?\\s*([^\\n]+)`, "i");
    const match = text.match(pattern);
    const value = match?.[1]?.trim().replace(/^[-–—]\s*/, "");
    if (value) return value;
  }
  return undefined;
}

function sectionValue(text: string, labels: readonly string[]): string | undefined {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const labelPattern = escaped.join("|");
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:Bid Number|Solicitation Number|Category|Status|Publication Date|Posted Date|Open Date|Opening Date|Closing Date|Bid Closing Date|Deadline|Contact|Pre-Bid|Documents?|Attachments?|Addenda?)\\s*:|$)`, "i"));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value
    .replace(/\b(?:at|by)\b/gi, " ")
    .replace(/\s+\((?:ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseType(title: string, category?: string): string {
  const text = `${category ?? ""} ${title}`.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(text)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotes?/.test(text)) return "RFQ";
  if (/\brfi\b|request for information/.test(text)) return "RFI";
  if (/\bitb\b|\bifb\b|invitation to bid|sealed bid/.test(text)) return "Bid";
  return "Solicitation";
}

function statusIsClosed(value: string | undefined): boolean {
  return Boolean(value && CLOSED_STATUS.test(value));
}

function deadlineIsExpired(value: Date | undefined): boolean {
  return Boolean(value && value.getTime() < Date.now());
}

function extractDocumentUrls(html: string, pageUrl: string, origin: string): string[] {
  const urls = new Set<string>();
  for (const anchor of extractAnchors(html)) {
    let candidate: URL;
    try {
      candidate = new URL(anchor.href, pageUrl);
    } catch {
      continue;
    }
    if (candidate.origin !== origin) continue;
    const absolute = sameOriginUrl(candidate.toString(), origin);
    if (!absolute) continue;
    if (!DOCUMENT_PATH.test(candidate.pathname + candidate.search) && !DOCUMENT_TEXT.test(anchor.text)) continue;
    urls.add(absolute);
  }
  return Array.from(urls);
}

function listingTitle(anchor: AnchorMatch, blockText: string): string | undefined {
  if (anchor.text && anchor.text.length >= 4 && !GENERIC_LINK_TEXT.test(anchor.text)) return anchor.text;
  const labelled = firstLabelValue(blockText, ["Title", "Bid Title", "Description"]);
  if (labelled) return labelled;
  const lines = blockText.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => line.length >= 8 && !/^(?:bid number|category|status|open date|closing date|deadline)\b/i.test(line));
}

export function parseCivicEngageListingHtml(
  html: string,
  tenant: CivicEngageTenant,
  pageUrl = tenant.listingUrl,
  listingPage = 1,
): CivicEngageListingRecord[] {
  const records: CivicEngageListingRecord[] = [];
  const seen = new Set<string>();

  for (const anchor of extractAnchors(html)) {
    let url: URL;
    try {
      url = new URL(anchor.href, pageUrl);
    } catch {
      continue;
    }
    if (url.origin !== tenant.origin || !isBidDetailUrl(url, tenant.listingUrl)) continue;

    const safeUrl = sameOriginUrl(url.toString(), tenant.origin);
    if (!safeUrl) continue;
    const blockText = htmlToText(enclosingListingBlock(html, anchor));
    const title = listingTitle(anchor, blockText);
    if (!title) continue;

    const status = firstLabelValue(blockText, ["Status"]);
    const responseDeadline = parseDate(firstLabelValue(blockText, ["Closing Date", "Bid Closing Date", "Close Date", "Deadline", "Due Date"]));
    if (statusIsClosed(status) || deadlineIsExpired(responseDeadline)) continue;

    const nativeBidId = nativeBidIdFromUrl(new URL(safeUrl));
    const key = `${tenant.portalId}:${nativeBidId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    records.push({
      nativeBidId,
      title,
      canonicalUrl: canonicalUrl(safeUrl),
      solicitationNumber: firstLabelValue(blockText, ["Bid Number", "Bid No", "Solicitation Number", "RFP Number", "RFQ Number"]),
      category: firstLabelValue(blockText, ["Category", "Department"]),
      status,
      postedDate: parseDate(firstLabelValue(blockText, ["Publication Date", "Posted Date", "Bid Posting Date", "Open Date", "Opening Date"])),
      responseDeadline,
      listingText: blockText,
      listingPage,
    });
  }

  return records;
}

export function parseCivicEngageDetailHtml(
  html: string,
  tenant: CivicEngageTenant,
  detailUrl: string,
): CivicEngageDetail {
  const text = htmlToText(html);
  const heading = html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
  const email = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  const phone = text.match(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?:\s*(?:x|ext\.?)[ .-]?\d+)?/i)?.[0];

  return {
    title: heading ? htmlToText(heading) : firstLabelValue(text, ["Title", "Bid Title"]),
    solicitationNumber: firstLabelValue(text, ["Bid Number", "Bid No", "Solicitation Number", "RFP Number", "RFQ Number"]),
    category: firstLabelValue(text, ["Category", "Department"]),
    status: firstLabelValue(text, ["Status"]),
    postedDate: parseDate(firstLabelValue(text, ["Publication Date", "Posted Date", "Bid Posting Date"])),
    openingDate: parseDate(firstLabelValue(text, ["Open Date", "Opening Date"])),
    responseDeadline: parseDate(firstLabelValue(text, ["Closing Date", "Bid Closing Date", "Close Date", "Deadline", "Due Date"])),
    description: sectionValue(text, ["Description", "Bid Description", "Scope"]),
    contactName: firstLabelValue(text, ["Contact Person", "Contact Name", "Contact"]),
    contactEmail: email,
    contactPhone: phone,
    preBidInformation: sectionValue(text, ["Pre-Bid Meeting", "Pre-Bid Information", "Prebid Meeting"]),
    documentUrls: extractDocumentUrls(html, detailUrl, tenant.origin),
  };
}

function listingToOpportunity(
  listing: CivicEngageListingRecord,
  detail: CivicEngageDetail | undefined,
  tenant: CivicEngageTenant,
): NormalizedOpportunity | undefined {
  const status = detail?.status ?? listing.status;
  const responseDeadline = detail?.responseDeadline ?? listing.responseDeadline;
  if (statusIsClosed(status) || deadlineIsExpired(responseDeadline)) return undefined;

  const postedDate = detail?.postedDate ?? detail?.openingDate ?? listing.postedDate;
  const title = detail?.title?.trim() || listing.title;
  const category = detail?.category ?? listing.category;
  const documentUrls = Array.from(new Set(detail?.documentUrls ?? []));
  const canonical = canonicalUrl(listing.canonicalUrl);

  return {
    externalId: `civicengage-${tenant.portalId}-${listing.nativeBidId}`,
    title,
    agency: tenant.buyerName,
    subAgency: category,
    type: parseType(title, category),
    status: "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline,
    placeOfPerformance: tenant.state,
    solicitationNumber: detail?.solicitationNumber ?? listing.solicitationNumber,
    description: detail?.description ?? listing.listingText,
    sourceUrl: canonical,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "civicengage_bids",
      providerType: "civicengage_public_bid_listing_detail",
      connectorName: "CivicEngage Bids.aspx shared adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "CivicEngage Official Bid Posting",
      sourceConfidence: "high",
      sourceId: tenant.portalId,
      tenantSlugOrId: new URL(tenant.listingUrl).hostname,
      nativeOpportunityId: listing.nativeBidId,
      buyerName: tenant.buyerName,
      buyerState: tenant.state,
      listingUrl: tenant.listingUrl,
      canonicalUrl: canonical,
      listingPage: listing.listingPage,
      documentUrls,
      contactName: detail?.contactName,
      contactEmail: detail?.contactEmail,
      contactPhone: detail?.contactPhone,
      preBidInformation: detail?.preBidInformation,
      dateUnknown: !postedDate,
      deadlineUnknown: !responseDeadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "civicengage-bids-platform",
        `state:${tenant.state}`,
        `portal:${tenant.portalId}`,
        ...(!postedDate ? ["date-unknown"] : []),
        ...(!responseDeadline ? ["deadline-unknown"] : []),
      ],
    },
  };
}

function matchesOptions(record: NormalizedOpportunity, options: FetchOptions): boolean {
  const keywords = options.keywords?.toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords?.length) {
    const haystack = [
      record.title,
      record.agency,
      record.subAgency,
      record.description,
      record.solicitationNumber,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!keywords.some((keyword) => haystack.includes(keyword))) return false;
  }
  if (options.dateRange && record.postedDate.getTime() > 0) {
    const cutoff = Date.now() - options.dateRange * 86_400_000;
    if (record.postedDate.getTime() < cutoff) return false;
  }
  return true;
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function collectTenant(
  tenant: CivicEngageTenant,
  options: FetchOptions,
): Promise<TenantCollectionResult> {
  const timeoutMs = positiveIntegerEnv("CIVICENGAGE_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000);
  const maxRetries = positiveIntegerEnv("CIVICENGAGE_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 2);
  const maxPages = positiveIntegerEnv("CIVICENGAGE_MAX_PAGES", DEFAULT_MAX_PAGES, 1, 10);
  const maxResults = positiveIntegerEnv("CIVICENGAGE_MAX_RESULTS_PER_TENANT", DEFAULT_MAX_RESULTS_PER_TENANT, 1, 200);
  const detailConcurrency = positiveIntegerEnv("CIVICENGAGE_DETAIL_CONCURRENCY", DEFAULT_DETAIL_CONCURRENCY, 1, 6);
  const offset = Math.max(options.offset ?? 0, 0);
  const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
  const targetCount = Math.min(maxResults, offset + requestedLimit);
  const queue: string[] = [tenant.listingUrl];
  const seenPages = new Set<string>();
  const seenPageSignatures = new Set<string>();
  const listings = new Map<string, CivicEngageListingRecord>();
  const errors: string[] = [];
  let listingPage = 0;

  while (queue.length && listingPage < maxPages && listings.size < targetCount) {
    const pageUrl = queue.shift();
    if (!pageUrl) break;
    const safePageUrl = sameOriginUrl(pageUrl, tenant.origin);
    if (!safePageUrl) {
      errors.push(`${tenant.portalId}: rejected cross-origin pagination URL ${pageUrl}`);
      continue;
    }
    const pageKey = canonicalUrl(safePageUrl).toLowerCase();
    if (seenPages.has(pageKey)) continue;
    seenPages.add(pageKey);

    let html: string;
    try {
      html = await fetchOfficialPortalText(safePageUrl, {
        label: `${tenant.portalId} CivicEngage listing`,
        origin: tenant.origin,
        timeoutMs,
        maxRetries,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (listings.size === 0) return { records: [], errors: [`${tenant.portalId}: ${reason}`] };
      errors.push(`${tenant.portalId}: partial listing results after ${reason}`);
      break;
    }

    const signature = stableHash(htmlToText(html));
    if (seenPageSignatures.has(signature)) break;
    seenPageSignatures.add(signature);
    listingPage += 1;

    for (const listing of parseCivicEngageListingHtml(html, tenant, safePageUrl, listingPage)) {
      const key = `${tenant.portalId}:${listing.nativeBidId}`;
      if (!listings.has(key)) listings.set(key, listing);
      if (listings.size >= targetCount) break;
    }

    if (listingPage >= maxPages || listings.size >= targetCount) continue;
    for (const nextUrl of extractSameOriginPaginationUrls(html, safePageUrl, tenant.origin, maxPages * 3)) {
      const nextKey = canonicalUrl(nextUrl).toLowerCase();
      if (!seenPages.has(nextKey) && !queue.some((queued) => canonicalUrl(queued).toLowerCase() === nextKey)) {
        queue.push(nextUrl);
      }
    }
  }

  const listingValues = Array.from(listings.values()).slice(0, targetCount);
  const enriched = await mapConcurrent(listingValues, detailConcurrency, async (listing) => {
    let detail: CivicEngageDetail | undefined;
    try {
      const html = await fetchOfficialPortalText(listing.canonicalUrl, {
        label: `${tenant.portalId} CivicEngage detail ${listing.nativeBidId}`,
        origin: tenant.origin,
        timeoutMs,
        maxRetries,
      });
      detail = parseCivicEngageDetailHtml(html, tenant, listing.canonicalUrl);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push(`${tenant.portalId}:${listing.nativeBidId}: detail enrichment failed: ${reason}`);
    }
    return listingToOpportunity(listing, detail, tenant);
  });

  const records = enriched
    .filter((record): record is NormalizedOpportunity => Boolean(record))
    .filter((record) => matchesOptions(record, options));
  const seenIds = new Set<string>();
  const deduped = records.filter((record) => {
    if (seenIds.has(record.externalId)) return false;
    seenIds.add(record.externalId);
    return true;
  });

  return { records: deduped.slice(offset, offset + requestedLimit), errors };
}

export class CivicEngageBidsProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(private readonly tenants: readonly CivicEngageTenant[] = CIVICENGAGE_TENANTS) {}

  async isConfigured(): Promise<boolean> {
    return this.tenants.length > 0;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const tenantConcurrency = positiveIntegerEnv("CIVICENGAGE_TENANT_CONCURRENCY", DEFAULT_TENANT_CONCURRENCY, 1, 6);
    const results = await mapConcurrent(this.tenants, tenantConcurrency, (tenant) => collectTenant(tenant, options));
    const errors = results.flatMap((result) => result.errors);
    const seen = new Set<string>();
    const records = results.flatMap((result) => result.records).filter((record) => {
      if (seen.has(record.externalId)) return false;
      seen.add(record.externalId);
      return true;
    });

    this.recordCount = records.length;
    this.lastError = errors.length ? errors.join("; ") : undefined;
    if (!errors.length || records.length) this.lastSuccess = new Date();
    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: this.name,
      configured,
      healthy: configured && !this.lastError,
      errorMessage: this.lastError,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      recordCount: this.recordCount,
    };
  }
}

export function civicEngageTenantProvider(portalId: string): DataSourceProvider | undefined {
  const tenant = CIVICENGAGE_TENANT_BY_PORTAL_ID.get(portalId);
  return tenant ? new CivicEngageBidsProvider([tenant]) : undefined;
}

export const civicEngageBidsProviders: Record<string, DataSourceProvider> = Object.fromEntries(
  CIVICENGAGE_TENANTS.map((tenant) => [tenant.portalId, new CivicEngageBidsProvider([tenant])]),
);

export { UNKNOWN_POSTED_DATE as CIVICENGAGE_UNKNOWN_POSTED_DATE, listingToOpportunity };
