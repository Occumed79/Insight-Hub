import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  fetchOfficialPortalText,
  positiveIntegerEnv,
  sameOriginUrl,
} from "./officialPortalHttp";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export const OREGON_BUYS_PORTAL_ID = "or-oregonbuys";
export const OREGON_BUYS_ORIGIN = "https://oregonbuys.gov";
export const OREGON_BUYS_LISTING_URL =
  "https://oregonbuys.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true";

export const OREGON_BUYS_SOURCE: PublicPortalSource = {
  id: OREGON_BUYS_PORTAL_ID,
  agencyName: "State of Oregon",
  agencyType: "state",
  state: "OR",
  sourceUrl: OREGON_BUYS_LISTING_URL,
  searchUrl: OREGON_BUYS_LISTING_URL,
  domain: "oregonbuys.gov",
  portalPlatform: "OregonBuys / Periscope S2G BSO",
  sourceLevel: "state",
  level: "state",
  accessMode: "portal",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated public OregonBuys open-bid listing/detail adapter.",
};

const UNKNOWN_POSTED_DATE = new Date(0);

export interface OregonBuysListing {
  bidNumber: string;
  organization: string;
  buyer?: string;
  description: string;
  bidOpeningDate?: string;
  status?: string;
  alternateId?: string;
  detailUrl: string;
}

interface OregonBuysDetail {
  bidNumber?: string;
  description?: string;
  bidOpeningDate?: string;
  purchaser?: string;
  organization?: string;
  department?: string;
  location?: string;
  alternateId?: string;
  availableDate?: string;
  bulletinDescription?: string;
  attachmentNames: string[];
  commodityCodes: string[];
}

const DETAIL_LABELS = [
  "Bid Number",
  "Description",
  "Bid Opening Date",
  "Purchaser",
  "Organization",
  "Department",
  "Location",
  "Alternate Id",
  "Available Date",
  "Bulletin Desc",
  "File Attachments",
  "Item Information",
] as const;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 10)));
}

function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|tr|td|th|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizeCell(value: string): string {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value
    .replace(/\s+(?:ET|EST|EDT|PT|PST|PDT|CT|CST|CDT|MT|MST|MDT)$/i, "")
    .trim();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function looksLikeDate(value: string): boolean {
  return /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(value)
    && /(?:\d{1,2}:\d{2}|\bAM\b|\bPM\b)/i.test(value);
}

function sameOriginDetailUrl(href: string): string | undefined {
  try {
    return sameOriginUrl(new URL(decodeHtml(href), OREGON_BUYS_LISTING_URL).toString(), OREGON_BUYS_ORIGIN);
  } catch {
    return undefined;
  }
}

export function parseOregonBuysListingHtml(html: string): OregonBuysListing[] {
  const records: OregonBuysListing[] = [];
  const seen = new Set<string>();

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1] ?? "";
    const detailAnchor = rowHtml.match(
      /<a\b[^>]*href=["']([^"']*\/external\/bidDetail\.sda\?[^"']*docId=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!detailAnchor) continue;

    const bidNumber = normalizeCell(detailAnchor[2] ?? "");
    const detailUrl = sameOriginDetailUrl(detailAnchor[1] ?? "");
    if (!bidNumber || !detailUrl || seen.has(bidNumber.toLowerCase())) continue;

    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi))
      .map((match) => normalizeCell(match[1] ?? ""))
      .filter(Boolean);
    const bidIndex = cells.findIndex((cell) => cell === bidNumber || cell.includes(bidNumber));
    const trailing = bidIndex >= 0 ? cells.slice(bidIndex + 1) : cells;
    const distinct = trailing.filter(
      (cell, index) => cell !== bidNumber && trailing.indexOf(cell) === index,
    );
    const dateIndex = distinct.findIndex(looksLikeDate);
    if (dateIndex < 1) continue;

    const beforeDate = distinct.slice(0, dateIndex);
    const afterDate = distinct.slice(dateIndex + 1);
    const organization = beforeDate[0] ?? "State of Oregon";
    const description = beforeDate[beforeDate.length - 1] ?? bidNumber;
    const buyer = beforeDate.length >= 3 ? beforeDate[beforeDate.length - 2] : undefined;
    const statusIndex = afterDate.findIndex((value) => /^(?:sent|open|ready|released|posted)$/i.test(value));
    const status = statusIndex >= 0 ? afterDate[statusIndex] : undefined;
    const alternateId = statusIndex >= 0 ? afterDate[statusIndex + 1] : undefined;
    const deadline = parseDate(distinct[dateIndex]);
    if (deadline && deadline.getTime() < Date.now()) continue;

    seen.add(bidNumber.toLowerCase());
    records.push({
      bidNumber,
      organization,
      buyer,
      description,
      bidOpeningDate: distinct[dateIndex],
      status,
      alternateId,
      detailUrl,
    });
  }

  return records;
}

function detailValue(text: string, label: string): string | undefined {
  const otherLabels = DETAIL_LABELS
    .filter((candidate) => candidate !== label)
    .map(escapeRegex)
    .join("|");
  const pattern = new RegExp(
    `${escapeRegex(label)}\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:${otherLabels})\\s*:|$)`,
    "i",
  );
  const value = text.match(pattern)?.[1]?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

function parseAttachments(html: string): string[] {
  const attachments = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = normalizeCell(match[1] ?? "");
    if (/\.(?:pdf|docx?|xlsx?|csv|zip)(?:\s|$)/i.test(name)) attachments.add(name.slice(0, 240));
  }
  return Array.from(attachments).slice(0, 50);
}

function parseCommodityCodes(text: string): string[] {
  const codes = new Set<string>();
  for (const match of text.matchAll(/(?:NIGP|U\s*N\s*S\s*P\s*S\s*C)\s*Code\s*:\s*([0-9][0-9\s-]{2,20})/gi)) {
    const code = (match[1] ?? "").replace(/\s+/g, "").replace(/-+$/, "");
    if (code) codes.add(code);
  }
  return Array.from(codes).slice(0, 25);
}

export function parseOregonBuysDetailHtml(html: string): OregonBuysDetail {
  const text = stripTags(html);
  return {
    bidNumber: detailValue(text, "Bid Number"),
    description: detailValue(text, "Description"),
    bidOpeningDate: detailValue(text, "Bid Opening Date"),
    purchaser: detailValue(text, "Purchaser"),
    organization: detailValue(text, "Organization"),
    department: detailValue(text, "Department"),
    location: detailValue(text, "Location"),
    alternateId: detailValue(text, "Alternate Id"),
    availableDate: detailValue(text, "Available Date"),
    bulletinDescription: detailValue(text, "Bulletin Desc"),
    attachmentNames: parseAttachments(html),
    commodityCodes: parseCommodityCodes(text),
  };
}

function inferType(title: string, description?: string): string {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(text)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotations?/.test(text)) return "RFQ";
  if (/\brfi\b|request for information/.test(text)) return "RFI";
  if (/\b(?:ifb|itb|rfb)\b|invitation (?:for|to) bids?|request for bids?/.test(text)) return "Bid";
  return "Bid Solicitation";
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
  listing: OregonBuysListing,
  detail?: OregonBuysDetail,
): NormalizedOpportunity | undefined {
  const bidNumber = detail?.bidNumber ?? listing.bidNumber;
  const responseDeadline = parseDate(detail?.bidOpeningDate ?? listing.bidOpeningDate);
  if (responseDeadline && responseDeadline.getTime() < Date.now()) return undefined;
  const postedDate = parseDate(detail?.availableDate);
  const title = detail?.description ?? listing.description ?? bidNumber;
  const organization = detail?.organization ?? listing.organization ?? "State of Oregon";
  const purchaser = detail?.purchaser ?? listing.buyer;
  const description = [
    detail?.bulletinDescription,
    title,
    detail?.department ? `Department: ${detail.department}` : undefined,
    detail?.location ? `Location: ${detail.location}` : undefined,
    purchaser ? `Purchaser: ${purchaser}` : undefined,
    detail?.attachmentNames.length ? `Public Attachments: ${detail.attachmentNames.join("; ")}` : undefined,
  ].filter(Boolean).join("\n");

  return {
    externalId: `${OREGON_BUYS_PORTAL_ID}-${bidNumber.replace(/[^a-z0-9._-]/gi, "-")}`,
    title,
    agency: organization,
    subAgency: detail?.department,
    type: inferType(title, description),
    status: "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline,
    placeOfPerformance: detail?.location || "Oregon",
    description,
    solicitationNumber: bidNumber,
    sourceUrl: listing.detailUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "periscope_s2g_bso",
      providerPlatform: "oregonbuys_bso",
      providerType: "statewide_public_listing_detail",
      connectorName: "OregonBuys dedicated adapter",
      discoveryMethod: "direct_official_listing",
      sourceBadge: "OregonBuys",
      sourceConfidence: "high",
      sourceId: OREGON_BUYS_PORTAL_ID,
      nativeOpportunityId: bidNumber,
      listingUrl: OREGON_BUYS_LISTING_URL,
      canonicalUrl: listing.detailUrl,
      listingStatus: listing.status,
      alternateId: detail?.alternateId ?? listing.alternateId,
      buyer: purchaser,
      attachmentNames: detail?.attachmentNames ?? [],
      commodityCodes: detail?.commodityCodes ?? [],
      dateUnknown: !postedDate,
      deadlineUnknown: !responseDeadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "platform:periscope-s2g-bso",
        "state:OR",
        ...(!postedDate ? ["date-unknown"] : []),
        ...(detail ? ["detail-enriched"] : []),
      ],
    },
  };
}

export class OregonBuysProvider implements DataSourceProvider {
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
    const timeoutMs = positiveIntegerEnv("BSO_REQUEST_TIMEOUT_MS", 30_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("BSO_MAX_RETRIES", 1, 0, 3);
    const detailLimit = positiveIntegerEnv("BSO_DETAIL_LIMIT", 4, 0, 25);
    const maxResults = positiveIntegerEnv("OREGON_BUYS_MAX_RESULTS", 250, 1, 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    const targetCount = Math.min(maxResults, offset + requestedLimit);
    const errors: string[] = [];

    let listingHtml: string;
    try {
      listingHtml = await fetchOfficialPortalText(OREGON_BUYS_LISTING_URL, {
        label: "OregonBuys open bids",
        origin: OREGON_BUYS_ORIGIN,
        timeoutMs,
        maxRetries,
        signal: options.signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.lastError = reason;
      this.recordCount = 0;
      return { records: [], total: 0, errors: [`${OREGON_BUYS_PORTAL_ID}: ${reason}`] };
    }

    const listings = parseOregonBuysListingHtml(listingHtml).slice(0, targetCount);
    if (!listings.length) {
      const reason = `${OREGON_BUYS_PORTAL_ID}: official OregonBuys open-bid page returned content but no recognizable active BSO bid rows`;
      this.lastError = reason;
      this.recordCount = 0;
      return { records: [], total: 0, errors: [reason] };
    }

    const enriched: Array<NormalizedOpportunity | undefined> = [];
    for (const [index, listing] of listings.entries()) {
      let detail: OregonBuysDetail | undefined;
      if (index < detailLimit) {
        try {
          const detailHtml = await fetchOfficialPortalText(listing.detailUrl, {
            label: `OregonBuys bid ${listing.bidNumber}`,
            origin: OREGON_BUYS_ORIGIN,
            timeoutMs,
            maxRetries,
            signal: options.signal,
          });
          detail = parseOregonBuysDetailHtml(detailHtml);
        } catch (error) {
          errors.push(
            `${OREGON_BUYS_PORTAL_ID}:${listing.bidNumber}: detail enrichment failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      enriched.push(toOpportunity(listing, detail));
    }

    const records = enriched
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => matchesOptions(record, options))
      .slice(offset, offset + requestedLimit);
    this.recordCount = records.length;
    this.lastError = records.length ? undefined : errors.join("; ") || undefined;
    if (records.length) this.lastSuccess = new Date();
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

export const oregonBuysProvider = new OregonBuysProvider();
