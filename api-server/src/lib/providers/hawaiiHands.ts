import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import {
  describeOfficialPortalRequestError,
  positiveIntegerEnv,
} from "./officialPortalHttp";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export const HAWAII_HANDS_PORTAL_ID = "hi-hiepro";
const ORIGIN = "https://hands.ehawaii.gov";
export const HAWAII_HANDS_LISTING_URL = `${ORIGIN}/hands/opportunities`;
export const HAWAII_HANDS_API_URL = `${ORIGIN}/hands/api/bidding-opportunities`;

export const HAWAII_HANDS_SOURCE: PublicPortalSource = {
  id: HAWAII_HANDS_PORTAL_ID,
  agencyName: "State of Hawaii",
  agencyType: "state",
  state: "HI",
  sourceUrl: HAWAII_HANDS_LISTING_URL,
  searchUrl: HAWAII_HANDS_LISTING_URL,
  domain: "hands.ehawaii.gov",
  portalPlatform: "Hawaii HANDS",
  sourceLevel: "state",
  level: "state",
  accessMode: "api",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated adapter for the unauthenticated first-party HANDS bidding-opportunities API.",
};

interface HandsOpportunity {
  id?: string | number;
  solicitionNo?: string;
  solicitationNo?: string;
  title?: string;
  category?: unknown;
  jurisdiction?: unknown;
  department?: unknown;
  island?: unknown;
  publishDate?: string;
  dueDate?: string;
  status?: string;
  closed?: boolean;
  system?: string;
  detailsUrl?: string;
  jurisdictionUrl?: string;
}

interface HandsResponse {
  data?: {
    searchResult?: {
      content?: HandsOpportunity[];
      totalElements?: number;
      totalPages?: number;
      number?: number;
    };
    total?: number;
  };
}

function plain(value: unknown): string | undefined {
  if (typeof value === "string") {
    const result = value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
    return result || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return plain(record.name)
      || plain(record.description)
      || plain(record.label)
      || plain(record.value);
  }
  return undefined;
}

function parseDate(value: unknown): Date | undefined {
  const raw = plain(value);
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/\bHST\b/gi, "")
    .replace(/\s+at\s+/gi, " ")
    .replace(/\b(\d{1,2}:\d{2})(am|pm)\b/gi, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function inferType(title: string, category?: string): string {
  const value = `${category ?? ""} ${title}`.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(value)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotations?/.test(value)) return "RFQ";
  if (/\brfi\b|request for information/.test(value)) return "RFI";
  if (/\b(?:ifb|itb|rfb)\b|invitation (?:for|to) bids?|request for bids?/.test(value)) return "Bid";
  return category || "Solicitation";
}

function officialDetailUrl(record: HandsOpportunity, nativeId: string): string {
  const external = plain(record.detailsUrl);
  if (external) {
    try {
      const url = new URL(external, HAWAII_HANDS_LISTING_URL);
      if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
    } catch {
      // Fall through to the official HANDS detail route.
    }
  }
  return `${ORIGIN}/hands/opportunities/opportunity-details/${encodeURIComponent(nativeId)}`;
}

export function parseHawaiiHandsJson(json: string): HandsOpportunity[] {
  const payload = JSON.parse(json) as HandsResponse;
  return Array.isArray(payload.data?.searchResult?.content)
    ? payload.data.searchResult.content
    : [];
}

function toOpportunity(record: HandsOpportunity): NormalizedOpportunity | undefined {
  const nativeId = plain(record.id)
    || plain(record.solicitionNo)
    || plain(record.solicitationNo);
  const title = plain(record.title);
  if (!nativeId || !title) return undefined;
  const status = plain(record.status)?.toUpperCase();
  if (status === "CANCELLED" || status === "DRAFT") return undefined;
  const deadline = parseDate(record.dueDate);
  if ((record.closed || status === "CLOSED") && deadline && deadline.getTime() < Date.now()) return undefined;
  const postedDate = parseDate(record.publishDate);
  const solicitationNumber = plain(record.solicitionNo)
    || plain(record.solicitationNo)
    || nativeId;
  const category = plain(record.category);
  const agency = plain(record.department)
    || plain(record.jurisdiction)
    || "State of Hawaii";
  const detailUrl = officialDetailUrl(record, nativeId);

  return {
    externalId: `${HAWAII_HANDS_PORTAL_ID}-${nativeId.replace(/[^a-z0-9._-]/gi, "-")}`,
    title,
    agency,
    type: inferType(title, category),
    status: "active",
    postedDate: postedDate ?? new Date(0),
    responseDeadline: deadline,
    placeOfPerformance: plain(record.island) || "Hawaii",
    description: [
      category ? `Category: ${category}` : undefined,
      plain(record.jurisdiction) ? `Jurisdiction: ${plain(record.jurisdiction)}` : undefined,
      plain(record.department) ? `Department: ${plain(record.department)}` : undefined,
    ].filter(Boolean).join("\n") || undefined,
    solicitationNumber,
    sourceUrl: detailUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_api",
      providerPlatform: "hawaii_hands",
      providerType: "statewide_public_opportunity_api",
      connectorName: "Hawaii HANDS bidding-opportunities API adapter",
      discoveryMethod: "first_party_browser_api",
      sourceBadge: "Hawaii HANDS Opportunities",
      sourceConfidence: "high",
      sourceId: HAWAII_HANDS_PORTAL_ID,
      nativeOpportunityId: nativeId,
      listingUrl: HAWAII_HANDS_LISTING_URL,
      apiUrl: HAWAII_HANDS_API_URL,
      upstreamSystem: plain(record.system),
      upstreamStatus: status,
      jurisdiction: plain(record.jurisdiction),
      jurisdictionUrl: plain(record.jurisdictionUrl),
      department: plain(record.department),
      island: plain(record.island),
      category,
      dateUnknown: !postedDate,
      deadlineUnknown: !deadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "first-party-public-api",
        "platform:hawaii-hands",
        "state:HI",
        ...(!postedDate ? ["date-unknown"] : []),
      ],
    },
  };
}

function matches(record: NormalizedOpportunity, options: FetchOptions): boolean {
  const terms = options.keywords?.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms?.length) {
    const haystack = [record.title, record.agency, record.description, record.solicitationNumber]
      .filter(Boolean).join(" ").toLowerCase();
    if (!terms.some((term) => haystack.includes(term))) return false;
  }
  if (options.dateRange && record.postedDate.getTime() > 0) {
    const cutoff = Date.now() - options.dateRange * 86_400_000;
    if (record.postedDate.getTime() < cutoff) return false;
  }
  return true;
}

async function fetchHandsJson(
  size: number,
  timeoutMs: number,
  maxRetries: number,
): Promise<string> {
  const url = new URL(HAWAII_HANDS_API_URL);
  url.searchParams.set("size", String(size));
  url.searchParams.set("page", "0");
  url.searchParams.set("sort", "publish_date_dt,desc");
  const body = JSON.stringify({
    query: "",
    showClosed: false,
    showCancelled: false,
    omitPagination: false,
    categories: [],
    procurementCategory: "",
    department: "",
    islands: [],
    statuses: ["POSTED"],
    publishDate: "",
    offerDueDate: "",
    jurisdiction: "",
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        redirect: "error",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          origin: ORIGIN,
          referer: HAWAII_HANDS_LISTING_URL,
          "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
        },
        body,
      });
      const responseBody = await response.text();
      if (response.ok) return responseBody;
      const message = `Hawaii HANDS bidding opportunities returned HTTP ${response.status}${responseBody ? `: ${plain(responseBody)?.slice(0, 180) ?? ""}` : ""}`;
      lastError = new Error(message);
      if ((response.status < 500 && response.status !== 429) || attempt >= maxRetries) break;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(400 * 2 ** attempt, 5_000)));
  }
  throw new Error(describeOfficialPortalRequestError(lastError, "Hawaii HANDS bidding opportunities", timeoutMs));
}

export class HawaiiHandsProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  async isConfigured(): Promise<boolean> { return true; }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("HAWAII_HANDS_TIMEOUT_MS", 30_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("HAWAII_HANDS_MAX_RETRIES", 1, 0, 2);
    const maxResults = positiveIntegerEnv("HAWAII_HANDS_MAX_RESULTS", 250, 1, 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const limit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    const target = Math.min(maxResults, offset + limit);

    let json: string;
    try {
      json = await fetchHandsJson(target, timeoutMs, maxRetries);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.lastError = reason;
      this.recordCount = 0;
      return { records: [], total: 0, errors: [`${HAWAII_HANDS_PORTAL_ID}: ${reason}`] };
    }

    let upstream: HandsOpportunity[];
    try {
      upstream = parseHawaiiHandsJson(json);
    } catch (error) {
      const reason = `Hawaii HANDS API returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
      this.lastError = reason;
      this.recordCount = 0;
      return { records: [], total: 0, errors: [`${HAWAII_HANDS_PORTAL_ID}: ${reason}`] };
    }

    const records = upstream
      .map(toOpportunity)
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => matches(record, options))
      .slice(offset, offset + limit);
    if (!records.length && upstream.length) {
      const reason = `${HAWAII_HANDS_PORTAL_ID}: official HANDS API returned opportunities but none normalized as active`;
      this.lastError = reason;
      this.recordCount = 0;
      return { records: [], total: 0, errors: [reason] };
    }

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

export const hawaiiHandsProvider = new HawaiiHandsProvider();
