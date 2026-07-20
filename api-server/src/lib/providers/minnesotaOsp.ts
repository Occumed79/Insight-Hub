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
} from "./officialPortalHttp";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export const MINNESOTA_OSP_PORTAL_ID = "mn-swift";
export const MINNESOTA_OSP_ORIGIN = "https://osp.admin.mn.gov";
export const MINNESOTA_OSP_LISTING_URL = "https://osp.admin.mn.gov/GS-auto";

export const MINNESOTA_OSP_SOURCE: PublicPortalSource = {
  id: MINNESOTA_OSP_PORTAL_ID,
  agencyName: "State of Minnesota Office of State Procurement",
  agencyType: "state",
  state: "MN",
  sourceUrl: MINNESOTA_OSP_LISTING_URL,
  searchUrl: MINNESOTA_OSP_LISTING_URL,
  domain: "osp.admin.mn.gov",
  portalPlatform: "Minnesota OSP official solicitation bulletin",
  sourceLevel: "state",
  level: "state",
  accessMode: "public_html",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated adapter for Minnesota's official Goods and Services Solicitation Postings bulletin.",
};

const UNKNOWN_POSTED_DATE = new Date(0);
const EXPLICIT_EMPTY = /\b(?:no current|no open|no active)\s+(?:goods and services\s+)?solicitations?\b/i;

export interface MinnesotaOspListing {
  referenceNumber: string;
  solicitationNumber?: string;
  title: string;
  agency: string;
  responseDeadline?: Date;
  postedDate?: Date;
  description?: string;
  categoryCodes: string[];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 16)));
}

function htmlToText(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|td|th|section|article|h[1-6]|dd|dt)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelValue(text: string, labels: readonly string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*•]\\s*)?${escapeRegex(label)}\\s*:?\\s*([^\\n]+)`, "i");
    const value = text.match(pattern)?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function sectionValue(
  text: string,
  startLabels: readonly string[],
  endLabels: readonly string[],
): string | undefined {
  const starts = startLabels.map(escapeRegex).join("|");
  const ends = endLabels.map(escapeRegex).join("|");
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:${starts})\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${ends})\\s*:?|$)`,
    "i",
  );
  const value = text.match(pattern)?.[1]?.replace(/\n{2,}/g, "\n").trim();
  return value || undefined;
}

function parseDate(value?: string, endOfDay = false): Date | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/\b(?:CST|CDT|CT)\b/gi, "")
    .replace(/\s+at\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const dateOnly = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(cleaned)
    || /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(cleaned);
  const parsed = new Date(endOfDay && dateOnly ? `${cleaned} 23:59:59.999` : cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseCategoryCodes(value?: string): string[] {
  if (!value) return [];
  return Array.from(new Set(value.match(/\b\d{5,10}\b/g) ?? [])).slice(0, 25);
}

function inferType(title: string, description?: string): string {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(text)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotations?/.test(text)) return "RFQ";
  if (/\brfi\b|request for information/.test(text)) return "RFI";
  if (/\b(?:ifb|itb|rfb)\b|invitation (?:for|to) bids?|request for bids?/.test(text)) return "Bid";
  return "Solicitation";
}

export function parseMinnesotaOspHtml(html: string): MinnesotaOspListing[] {
  const text = htmlToText(html);
  if (!/\bREFERENCE NUMBER\s*:/i.test(text)) return [];

  const records: MinnesotaOspListing[] = [];
  const seen = new Set<string>();
  const blocks = text.split(/\n(?=\s*(?:[-*•]\s*)?REFERENCE NUMBER\s*:)/i);
  for (const block of blocks) {
    const referenceNumber = labelValue(block, ["REFERENCE NUMBER"]);
    const solicitationNumber = labelValue(block, ["Solicitation Number", "Event ID"]);
    const title = labelValue(block, ["Title", "Solicitation Title"]);
    if (!referenceNumber || !title) continue;

    const responseDeadline = parseDate(labelValue(block, [
      "Response to this solicitation is due no later than",
      "Response Due Date",
      "Due Date",
    ]), true);
    if (responseDeadline && responseDeadline.getTime() < Date.now()) continue;

    const key = (solicitationNumber || referenceNumber).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const agency = labelValue(block, ["Purchasing Agency", "Agency", "Department"])
      || "State of Minnesota";
    const description = sectionValue(
      block,
      ["Description of Work", "Description", "Notes"],
      ["Date This Solicitation Was Posted", "Category Codes", "REFERENCE NUMBER"],
    );
    records.push({
      referenceNumber,
      solicitationNumber,
      title,
      agency,
      responseDeadline,
      postedDate: parseDate(labelValue(block, ["Date This Solicitation Was Posted", "Posted Date"])),
      description,
      categoryCodes: parseCategoryCodes(labelValue(block, ["Category Codes", "Category Code"])),
    });
  }
  return records;
}

function matchesOptions(record: NormalizedOpportunity, options: FetchOptions): boolean {
  const keywords = options.keywords?.toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords?.length) {
    const haystack = [
      record.title,
      record.agency,
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

function toOpportunity(listing: MinnesotaOspListing): NormalizedOpportunity {
  const nativeId = listing.solicitationNumber || listing.referenceNumber;
  return {
    externalId: `${MINNESOTA_OSP_PORTAL_ID}-${nativeId.replace(/[^a-z0-9._-]/gi, "-")}`,
    title: listing.title,
    agency: listing.agency,
    type: inferType(listing.title, listing.description),
    status: "active",
    postedDate: listing.postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline: listing.responseDeadline,
    placeOfPerformance: "Minnesota",
    description: listing.description,
    solicitationNumber: nativeId,
    sourceUrl: MINNESOTA_OSP_LISTING_URL,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_bulletin",
      providerPlatform: "minnesota_osp_solicitation_postings",
      providerType: "statewide_public_listing",
      connectorName: "Minnesota OSP official solicitation bulletin adapter",
      discoveryMethod: "direct_official_listing",
      sourceBadge: "Minnesota OSP Solicitation Postings",
      sourceConfidence: "high",
      sourceId: MINNESOTA_OSP_PORTAL_ID,
      nativeOpportunityId: nativeId,
      referenceNumber: listing.referenceNumber,
      categoryCodes: listing.categoryCodes,
      listingUrl: MINNESOTA_OSP_LISTING_URL,
      dateUnknown: !listing.postedDate,
      deadlineUnknown: !listing.responseDeadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "official-state-bulletin",
        "state:MN",
        ...(!listing.postedDate ? ["date-unknown"] : []),
        ...(!listing.responseDeadline ? ["deadline-unknown"] : []),
      ],
    },
  };
}

export class MinnesotaOspProvider implements DataSourceProvider {
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
    const timeoutMs = positiveIntegerEnv("MINNESOTA_OSP_REQUEST_TIMEOUT_MS", 30_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("MINNESOTA_OSP_MAX_RETRIES", 1, 0, 2);
    const maxResults = positiveIntegerEnv("MINNESOTA_OSP_MAX_RESULTS", 250, 1, 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);

    let html: string;
    try {
      html = await fetchOfficialPortalText(MINNESOTA_OSP_LISTING_URL, {
        label: "Minnesota OSP solicitation postings",
        origin: MINNESOTA_OSP_ORIGIN,
        timeoutMs,
        maxRetries,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.lastError = reason;
      this.recordCount = 0;
      return { records: [], total: 0, errors: [`${MINNESOTA_OSP_PORTAL_ID}: ${reason}`] };
    }

    const listings = parseMinnesotaOspHtml(html);
    if (!listings.length && !EXPLICIT_EMPTY.test(htmlToText(html))) {
      const reason = `${MINNESOTA_OSP_PORTAL_ID}: official OSP bulletin returned content but no recognizable current solicitation records`;
      this.lastError = reason;
      this.recordCount = 0;
      return { records: [], total: 0, errors: [reason] };
    }

    const records = listings
      .map(toOpportunity)
      .filter((record) => matchesOptions(record, options))
      .slice(offset, offset + requestedLimit);
    this.recordCount = records.length;
    this.lastError = undefined;
    this.lastSuccess = new Date();
    return { records, total: records.length, errors: [] };
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

export const minnesotaOspProvider = new MinnesotaOspProvider();
