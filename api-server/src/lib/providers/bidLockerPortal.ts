import { createHash } from "node:crypto";

import {
  fetchOfficialPortalText,
  positiveIntegerEnv,
} from "./officialPortalHttp";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";

const BIDLOCKER_ORIGIN = "https://bidlocker.us";
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_MAX_RESULTS_PER_TENANT = 25;
const DEFAULT_DETAIL_CONCURRENCY = 4;
const UNKNOWN_POSTED_DATE = new Date(0);
const EMPTY_ACTIVE_LISTING = /\b(?:we have no open bid or contracting opportunities|no active solicitations|no open solicitations)\b/i;
const GENERIC_LINK_TEXT = /^(?:view details?|details?|open|submit bid|express interest)$/i;

export interface BidLockerTenant {
  portalId: string;
  tenantSlug: string;
  buyerName: string;
  state: string;
}

export const BIDLOCKER_TENANTS: BidLockerTenant[] = [
  {
    portalId: "or-clackamas-county",
    tenantSlug: "clackamascounty",
    buyerName: "Clackamas County",
    state: "OR",
  },
  {
    portalId: "or-deschutes-county",
    tenantSlug: "deschutescounty",
    buyerName: "Deschutes County",
    state: "OR",
  },
  {
    portalId: "or-lane-county",
    tenantSlug: "lanecounty",
    buyerName: "Lane County",
    state: "OR",
  },
];

export const BIDLOCKER_COLLECTIBLE_PORTAL_IDS = new Set(
  BIDLOCKER_TENANTS.map((tenant) => tenant.portalId),
);

const TENANT_BY_PORTAL_ID = new Map(
  BIDLOCKER_TENANTS.map((tenant) => [tenant.portalId, tenant]),
);

export interface BidLockerListingItem {
  nativeId: string;
  title: string;
  detailUrl: string;
}

export interface BidLockerDetail {
  nativeId: string;
  title: string;
  projectNumber?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  status: "active" | "archived";
  description?: string;
  detailUrl: string;
}

function listingUrl(tenant: BidLockerTenant): string {
  return `${BIDLOCKER_ORIGIN}/a/${tenant.tenantSlug}/BidLocker`;
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
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCharCode(Number(code)),
    );
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizedDetailUrl(
  href: string,
  tenant: BidLockerTenant,
): string | undefined {
  try {
    const url = new URL(decodeHtml(href), BIDLOCKER_ORIGIN);
    if (url.origin !== BIDLOCKER_ORIGIN) return undefined;
    if (!url.pathname.startsWith(`/a/${tenant.tenantSlug}/details/`)) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function nativeIdFromDetailUrl(url: string): string {
  const segment = new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  const numeric = segment.match(/^\d+/)?.[0];
  return numeric || createHash("sha256").update(url).digest("hex").slice(0, 16);
}

export function parseBidLockerListingHtml(
  html: string,
  tenant: BidLockerTenant,
): BidLockerListingItem[] {
  const results: BidLockerListingItem[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const detailUrl = normalizedDetailUrl(match[1] ?? "", tenant);
    if (!detailUrl || seen.has(detailUrl)) continue;
    const title = stripHtml(match[2] ?? "");
    if (!title || title.length < 5 || GENERIC_LINK_TEXT.test(title)) continue;

    seen.add(detailUrl);
    results.push({
      nativeId: nativeIdFromDetailUrl(detailUrl),
      title,
      detailUrl,
    });
  }

  return results;
}

const MONTHS = new Map(
  [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].map((month, index) => [month, index]),
);

function parseBidLockerDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i,
  );
  if (!match) {
    const fallback = new Date(normalized);
    return Number.isNaN(fallback.getTime()) ? undefined : fallback;
  }

  const month = MONTHS.get(match[1].slice(0, 3).toLowerCase());
  if (month === undefined) return undefined;
  const day = Number(match[2]);
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const meridiem = match[6].toUpperCase();
  if (hour === 12) hour = 0;
  if (meridiem === "PM") hour += 12;

  const pacificOffsetMinutes = /Pacific Standard Time/i.test(normalized)
    ? 8 * 60
    : 7 * 60;
  return new Date(
    Date.UTC(year, month, day, hour, minute) + pacificOffsetMinutes * 60_000,
  );
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  const value = text.match(pattern)?.[1]?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

function detailDescription(html: string, text: string): string | undefined {
  const section = html.match(
    /<h[1-6]\b[^>]*>\s*Description\s*<\/h[1-6]>([\s\S]*?)(?=<h[1-6]\b|$)/i,
  )?.[1];
  const fromMarkup = section ? stripHtml(section) : undefined;
  if (fromMarkup) return fromMarkup.slice(0, 8_000);

  const fromText = firstMatch(
    text,
    /(?:^|\n)Description\n([\s\S]*?)(?=\n(?:Attachments|Vendor Questions|For Questions|About )\b|$)/i,
  );
  return fromText?.slice(0, 8_000);
}

export function parseBidLockerDetailHtml(
  html: string,
  tenant: BidLockerTenant,
  detailUrl: string,
  listingTitle?: string,
): BidLockerDetail | undefined {
  const text = stripHtml(html);
  const heading = stripHtml(
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "",
  );
  const title = heading || listingTitle?.trim();
  if (!title) return undefined;

  const projectNumber = firstMatch(
    text,
    /Project\s*#:\s*(.+?)(?=\s+(?:Category:|Department:|Issued by:|Publish Date:))/i,
  );
  const postedValue = firstMatch(
    text,
    /Publish Date:\s*(.+?)(?=\s+(?:Bids|Proposals|Responses|Quotes?)\s+Due Date:)/i,
  );
  const dueValue = firstMatch(
    text,
    /(?:Bids|Proposals|Responses|Quotes?)\s+Due Date:\s*(.+?)(?=\s+(?:Estimated Project Date:|Status:))/i,
  );
  const statusText = firstMatch(text, /Status:\s*([A-Za-z]+)/i);

  return {
    nativeId: nativeIdFromDetailUrl(detailUrl),
    title,
    projectNumber,
    postedDate: parseBidLockerDate(postedValue),
    responseDeadline: parseBidLockerDate(dueValue),
    status: /^open$/i.test(statusText ?? "") ? "active" : "archived",
    description: detailDescription(html, text),
    detailUrl,
  };
}

function opportunityType(value: string): string {
  const normalized = value.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(normalized)) return "RFP";
  if (/\brfq\b|request for qualifications?/.test(normalized)) return "RFQ";
  if (/\brfi\b|request for information/.test(normalized)) return "RFI";
  if (/\bitb\b|\bifb\b|invitation to bid|\bbid\b/.test(normalized)) return "Bid";
  return "Solicitation";
}

function detailToOpportunity(
  detail: BidLockerDetail,
  tenant: BidLockerTenant,
): NormalizedOpportunity {
  return {
    externalId: `bidlocker-${tenant.tenantSlug}-${detail.nativeId}`,
    title: detail.title,
    agency: tenant.buyerName,
    type: opportunityType(`${detail.projectNumber ?? ""} ${detail.title}`),
    status: detail.status,
    postedDate: detail.postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline: detail.responseDeadline,
    placeOfPerformance: tenant.state,
    solicitationNumber: detail.projectNumber,
    description: detail.description,
    sourceUrl: detail.detailUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "bidlocker",
      providerType: "bidlocker_public_listing_and_detail",
      connectorName: "BidLocker shared public adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "BidLocker Official Portal",
      sourceConfidence: detail.postedDate ? "high" : "medium",
      sourceId: tenant.portalId,
      tenantSlugOrId: tenant.tenantSlug,
      nativeOpportunityId: detail.nativeId,
      buyerName: tenant.buyerName,
      buyerState: tenant.state,
      listingUrl: listingUrl(tenant),
      canonicalUrl: detail.detailUrl,
      documentUrls: [] as string[],
      dateUnknown: !detail.postedDate,
      deadlineUnknown: !detail.responseDeadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "bidlocker-platform",
        `state:${tenant.state}`,
        `tenant:${tenant.tenantSlug}`,
        `portal:${tenant.portalId}`,
        ...(!detail.postedDate ? ["date-unknown"] : []),
      ],
    },
  };
}

async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Math.min(Math.max(1, concurrency), Math.max(1, values.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        const value = values[index];
        if (value === undefined) return;
        await worker(value);
      }
    }),
  );
}

interface TenantCollectionResult {
  records: NormalizedOpportunity[];
  errors: string[];
}

async function collectTenant(
  tenant: BidLockerTenant,
  options: FetchOptions,
): Promise<TenantCollectionResult> {
  const timeoutMs = positiveIntegerEnv(
    "BIDLOCKER_REQUEST_TIMEOUT_MS",
    DEFAULT_REQUEST_TIMEOUT_MS,
    3_000,
    60_000,
  );
  const maxRetries = positiveIntegerEnv(
    "BIDLOCKER_MAX_RETRIES",
    DEFAULT_MAX_RETRIES,
    0,
    3,
  );
  const maxResults = positiveIntegerEnv(
    "BIDLOCKER_MAX_RESULTS_PER_TENANT",
    DEFAULT_MAX_RESULTS_PER_TENANT,
    1,
    100,
  );
  const detailConcurrency = positiveIntegerEnv(
    "BIDLOCKER_DETAIL_CONCURRENCY",
    DEFAULT_DETAIL_CONCURRENCY,
    1,
    8,
  );
  const url = listingUrl(tenant);
  let listingHtml: string;
  try {
    listingHtml = await fetchOfficialPortalText(url, {
      label: `${tenant.portalId} BidLocker listing`,
      origin: BIDLOCKER_ORIGIN,
      timeoutMs,
      maxRetries,
      signal: options.signal,
    });
  } catch (error) {
    return {
      records: [],
      errors: [
        `${tenant.portalId}: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  const listingItems = parseBidLockerListingHtml(listingHtml, tenant).slice(
    0,
    maxResults,
  );
  if (listingItems.length === 0) {
    if (EMPTY_ACTIVE_LISTING.test(stripHtml(listingHtml))) {
      return { records: [], errors: [] };
    }
    return {
      records: [],
      errors: [
        `${tenant.portalId}: BidLocker listing loaded but no recognizable active solicitation links were found`,
      ],
    };
  }

  const keywords = options.keywords
    ?.toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const selectedItems = listingItems.filter((item) => {
    if (!keywords?.length) return true;
    return keywords.some((keyword) => item.title.toLowerCase().includes(keyword));
  });
  const records: NormalizedOpportunity[] = [];
  const errors: string[] = [];

  await runWithConcurrency(selectedItems, detailConcurrency, async (item) => {
    try {
      const detailHtml = await fetchOfficialPortalText(item.detailUrl, {
        label: `${tenant.portalId} BidLocker detail ${item.nativeId}`,
        origin: BIDLOCKER_ORIGIN,
        timeoutMs,
        maxRetries,
        signal: options.signal,
      });
      const parsed = parseBidLockerDetailHtml(
        detailHtml,
        tenant,
        item.detailUrl,
        item.title,
      );
      if (!parsed) {
        throw new Error("detail page did not contain a recognizable title");
      }
      records.push(detailToOpportunity(parsed, tenant));
    } catch (error) {
      errors.push(
        `${tenant.portalId}/${item.nativeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      records.push(
        detailToOpportunity(
          {
            nativeId: item.nativeId,
            title: item.title,
            status: "active",
            detailUrl: item.detailUrl,
          },
          tenant,
        ),
      );
    }
  });

  return { records, errors };
}

export class BidLockerPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(
    private readonly tenants: readonly BidLockerTenant[] = BIDLOCKER_TENANTS,
  ) {}

  async isConfigured(): Promise<boolean> {
    return this.tenants.length > 0;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const tenantResults = await Promise.all(
      this.tenants.map((tenant) => collectTenant(tenant, options)),
    );
    const seen = new Set<string>();
    const records = tenantResults
      .flatMap((result) => result.records)
      .filter((record) => {
        if (seen.has(record.externalId)) return false;
        seen.add(record.externalId);
        return true;
      });
    const errors = tenantResults.flatMap((result) => result.errors);
    const offset = Math.max(options.offset ?? 0, 0);
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
    const selected = records.slice(offset, offset + limit);

    this.recordCount = selected.length;
    this.lastError = errors.length ? errors.join("; ") : undefined;
    if (!errors.length || selected.length > 0) this.lastSuccess = new Date();
    return { records: selected, total: selected.length, errors };
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

export function bidLockerTenantProvider(
  portalId: string,
): DataSourceProvider | undefined {
  const tenant = TENANT_BY_PORTAL_ID.get(portalId);
  return tenant ? new BidLockerPortalProvider([tenant]) : undefined;
}

export const bidLockerPortalProvider = new BidLockerPortalProvider();
export { listingUrl as bidLockerListingUrl };
