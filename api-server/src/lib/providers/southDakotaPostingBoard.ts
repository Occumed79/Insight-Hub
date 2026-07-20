import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { fetchOfficialPortalText, positiveIntegerEnv } from "./officialPortalHttp";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export const SOUTH_DAKOTA_POSTING_BOARD_PORTAL_ID = "sd-solicitations";
const UID = "3444a404-3818-494f-84c5-2a850acd7779";
const ORIGIN = "https://postingboard.esmsolutions.com";
export const SOUTH_DAKOTA_POSTING_BOARD_LISTING_URL = `${ORIGIN}/${UID}/events`;
export const SOUTH_DAKOTA_POSTING_BOARD_API_URL = `${ORIGIN}/api/postingBoard/${UID}/currentevents`;

export const SOUTH_DAKOTA_POSTING_BOARD_SOURCE: PublicPortalSource = {
  id: SOUTH_DAKOTA_POSTING_BOARD_PORTAL_ID,
  agencyName: "State of South Dakota",
  agencyType: "state",
  state: "SD",
  sourceUrl: SOUTH_DAKOTA_POSTING_BOARD_LISTING_URL,
  searchUrl: SOUTH_DAKOTA_POSTING_BOARD_LISTING_URL,
  domain: "postingboard.esmsolutions.com",
  portalPlatform: "ESM Solutions Posting Board",
  sourceLevel: "state",
  level: "state",
  accessMode: "public_api",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated adapter for the first-party ESM current-events API.",
};

interface PostingEvent {
  eventId?: string | number;
  id?: string | number;
  eventName?: string;
  name?: string;
  description?: string;
  publishedDate?: string;
  eventDueDate?: string;
  invitationType?: string | { description?: string; name?: string };
  status?: string | { description?: string; name?: string };
  organizationName?: string;
  customerName?: string;
  departmentName?: string;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return text(object.description) || text(object.name) || text(object.label);
  }
  return undefined;
}

function date(value: unknown): Date | undefined {
  const valueText = text(value);
  if (!valueText) return undefined;
  const parsed = new Date(valueText);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function inferType(title: string, invitationType?: string): string {
  const value = `${invitationType ?? ""} ${title}`.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(value)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotations?/.test(value)) return "RFQ";
  if (/\brfi\b|request for information/.test(value)) return "RFI";
  if (/\b(?:ifb|itb|rfb)\b|invitation (?:for|to) bids?|request for bids?/.test(value)) return "Bid";
  return invitationType || "Solicitation";
}

export function parseSouthDakotaPostingBoardJson(json: string): PostingEvent[] {
  const payload = JSON.parse(json) as unknown;
  const events = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ((payload as Record<string, unknown>).data
        ?? (payload as Record<string, unknown>).events
        ?? (payload as Record<string, unknown>).content)
      : [];
  if (!Array.isArray(events)) return [];
  return events as PostingEvent[];
}

function apiUrl(limit: number): string {
  const url = new URL(SOUTH_DAKOTA_POSTING_BOARD_API_URL);
  url.searchParams.set("pageNo", "0");
  url.searchParams.set("recordsPerPage", String(limit));
  url.searchParams.set("sortOrder", "eventDueDate");
  url.searchParams.set("sortAsc", "true");
  url.searchParams.set("browserGlobalTimeZoneNameId", "Coordinated Universal Time");
  url.searchParams.set("browserGlobalTimeZoneName", "UTC");
  url.searchParams.set("browserOffset", "+00:00:00");
  return url.toString();
}

function toOpportunity(event: PostingEvent): NormalizedOpportunity | undefined {
  const nativeId = text(event.eventId) || text(event.id);
  const title = text(event.eventName) || text(event.name);
  if (!nativeId || !title) return undefined;
  const deadline = date(event.eventDueDate);
  if (deadline && deadline.getTime() < Date.now()) return undefined;
  const postedDate = date(event.publishedDate);
  const invitationType = text(event.invitationType);
  const agency = text(event.organizationName) || text(event.customerName) || "State of South Dakota";
  const detailUrl = `${ORIGIN}/${UID}/eventDetail/${encodeURIComponent(nativeId)}`;
  return {
    externalId: `${SOUTH_DAKOTA_POSTING_BOARD_PORTAL_ID}-${nativeId.replace(/[^a-z0-9._-]/gi, "-")}`,
    title,
    agency,
    subAgency: text(event.departmentName),
    type: inferType(title, invitationType),
    status: "active",
    postedDate: postedDate ?? new Date(0),
    responseDeadline: deadline,
    placeOfPerformance: "South Dakota",
    description: text(event.description),
    solicitationNumber: nativeId,
    sourceUrl: detailUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_api",
      providerPlatform: "esm_posting_board",
      providerType: "statewide_public_event_api",
      connectorName: "South Dakota ESM Posting Board API adapter",
      discoveryMethod: "first_party_browser_api",
      sourceBadge: "South Dakota Central Bid Exchange",
      sourceConfidence: "high",
      sourceId: SOUTH_DAKOTA_POSTING_BOARD_PORTAL_ID,
      nativeOpportunityId: nativeId,
      listingUrl: SOUTH_DAKOTA_POSTING_BOARD_LISTING_URL,
      apiUrl: SOUTH_DAKOTA_POSTING_BOARD_API_URL,
      invitationType,
      upstreamStatus: text(event.status),
      dateUnknown: !postedDate,
      deadlineUnknown: !deadline,
      collectedAt: new Date().toISOString(),
      tags: ["direct-official-portal", "first-party-public-api", "platform:esm-posting-board", "state:SD"],
    },
  };
}

function matches(record: NormalizedOpportunity, options: FetchOptions): boolean {
  const terms = options.keywords?.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms?.length) return true;
  const haystack = [record.title, record.agency, record.description, record.solicitationNumber]
    .filter(Boolean).join(" ").toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

export class SouthDakotaPostingBoardProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  async isConfigured(): Promise<boolean> { return true; }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("SOUTH_DAKOTA_POSTING_BOARD_TIMEOUT_MS", 30_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("SOUTH_DAKOTA_POSTING_BOARD_MAX_RETRIES", 1, 0, 2);
    const maxResults = positiveIntegerEnv("SOUTH_DAKOTA_POSTING_BOARD_MAX_RESULTS", 250, 1, 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const limit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    let json: string;
    try {
      json = await fetchOfficialPortalText(apiUrl(Math.min(maxResults, offset + limit)), {
        label: "South Dakota posting-board current events",
        origin: ORIGIN,
        timeoutMs,
        maxRetries,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.lastError = reason;
      return { records: [], total: 0, errors: [`${SOUTH_DAKOTA_POSTING_BOARD_PORTAL_ID}: ${reason}`] };
    }

    let events: PostingEvent[];
    try {
      events = parseSouthDakotaPostingBoardJson(json);
    } catch (error) {
      const reason = `official API returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
      this.lastError = reason;
      return { records: [], total: 0, errors: [`${SOUTH_DAKOTA_POSTING_BOARD_PORTAL_ID}: ${reason}`] };
    }
    const records = events.map(toOpportunity)
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => matches(record, options))
      .slice(offset, offset + limit);
    if (!records.length && events.length) {
      const reason = `${SOUTH_DAKOTA_POSTING_BOARD_PORTAL_ID}: official API returned events but none normalized as active`;
      this.lastError = reason;
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

export const southDakotaPostingBoardProvider = new SouthDakotaPostingBoardProvider();
