import { createHash } from "node:crypto";
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

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_MAX_RESULTS_PER_TENANT = 50;
const UNKNOWN_POSTED_DATE = new Date(0);
const PLANETBIDS_ORIGIN = "https://vendors.planetbids.com";
const CLOSED_STATUS = /\b(?:closed|awarded|cancelled|canceled|expired|complete|completed)\b/i;
const EMPTY_LISTING = /\b(?:no (?:current |open )?(?:bid|bidding|solicitation|opportunit)(?:y|ies)|no records? found|0 results?)\b/i;
const ACCESS_CHALLENGE = /\b(?:captcha|access denied|sign in required|login required|verify you are human)\b/i;
const GENERIC_LINK_TEXT = /^(?:view|details?|open|bid details?|opportunity|click here)$/i;

export interface PlanetBidsTenant {
  portalId: string;
  buyerId: string;
  buyerName: string;
  state: string;
}

export const PLANETBIDS_TENANTS: PlanetBidsTenant[] = [
  {
    portalId: "ca-fresno",
    buyerId: "14769",
    buyerName: "City of Fresno",
    state: "CA",
  },
  {
    portalId: "ca-irvine",
    buyerId: "15927",
    buyerName: "City of Irvine",
    state: "CA",
  },
  {
    portalId: "ca-imperial-county",
    buyerId: "64020",
    buyerName: "Imperial County",
    state: "CA",
  },
];

export const PLANETBIDS_COLLECTIBLE_PORTAL_IDS = new Set(
  PLANETBIDS_TENANTS.map((tenant) => tenant.portalId),
);

const TENANT_BY_PORTAL_ID = new Map(
  PLANETBIDS_TENANTS.map((tenant) => [tenant.portalId, tenant]),
);

export interface PlanetBidsListingRow {
  bidId: string;
  title: string;
  solicitationNumber?: string;
  postedDate?: string;
  responseDeadline?: string;
  status?: string;
  detailUrl: string;
  listingText: string;
}

function listingUrl(tenant: PlanetBidsTenant): string {
  return `${PLANETBIDS_ORIGIN}/portal/${tenant.buyerId}/bo/bo-search`;
}

function detailUrl(tenant: PlanetBidsTenant, bidId: string): string {
  return `${PLANETBIDS_ORIGIN}/portal/${tenant.buyerId}/bo/bo-detail/${encodeURIComponent(bidId)}`;
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
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value
    .replace(/\b(?:PST|PDT|MST|MDT|CST|CDT|EST|EDT|PT|MT|CT|ET)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function dateStrings(value: string): string[] {
  return Array.from(
    value.matchAll(
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?(?:\s*\([A-Z]{2,4}\))?/gi,
    ),
    (match) => match[0].trim(),
  );
}

function extractCells(rowHtml: string): string[] {
  return Array.from(rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
    .map((match) => stripHtml(match[1] ?? ""))
    .filter(Boolean);
}

function solicitationCandidate(
  cells: string[],
  title: string,
  dates: readonly string[],
): string | undefined {
  const excluded = new Set([title, ...dates].map((value) => value.toLowerCase()));
  return cells.find((cell) => {
    const normalized = cell.trim();
    if (!normalized || excluded.has(normalized.toLowerCase())) return false;
    if (normalized.length > 60) return false;
    return /^(?=.*\d)[A-Z0-9][A-Z0-9._/#-]{2,}$/i.test(normalized);
  });
}

function titleFromRow(rowHtml: string, cells: string[]): string | undefined {
  const detailAnchor = rowHtml.match(
    /<a\b[^>]*href=["'][^"']*\/bo\/bo-detail\/[^"'/?#]+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
  );
  const anchorText = stripHtml(detailAnchor?.[1] ?? "");
  if (anchorText && !GENERIC_LINK_TEXT.test(anchorText)) return anchorText;

  return cells.find((cell) => {
    if (cell.length < 5 || cell.length > 300) return false;
    if (dateStrings(cell).length > 0) return false;
    if (/^(?:status|posted|due|close|bid number|solicitation)$/i.test(cell)) return false;
    return /[a-z]/i.test(cell);
  });
}

function rowFromContext(
  contextHtml: string,
  tenant: PlanetBidsTenant,
  href: string,
  bidId: string,
): PlanetBidsListingRow | undefined {
  const cells = extractCells(contextHtml);
  const title = titleFromRow(contextHtml, cells);
  if (!title) return undefined;

  const listingText = stripHtml(contextHtml);
  const dates = dateStrings(listingText);
  const postedDate = dates[0];
  const responseDeadline = dates.length > 1 ? dates[dates.length - 1] : undefined;
  const solicitationNumber = solicitationCandidate(
    cells,
    title,
    dates,
  );
  const resolvedDetailUrl = (() => {
    try {
      const parsed = new URL(href, PLANETBIDS_ORIGIN);
      if (parsed.origin !== PLANETBIDS_ORIGIN) return detailUrl(tenant, bidId);
      return parsed.toString();
    } catch {
      return detailUrl(tenant, bidId);
    }
  })();

  return {
    bidId,
    title,
    solicitationNumber,
    postedDate,
    responseDeadline,
    status: CLOSED_STATUS.test(listingText) ? "closed" : "active",
    detailUrl: resolvedDetailUrl,
    listingText,
  };
}

export function parsePlanetBidsListingHtml(
  html: string,
  tenant: PlanetBidsTenant,
): PlanetBidsListingRow[] {
  const rows: PlanetBidsListingRow[] = [];
  const seen = new Set<string>();

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[0];
    const detailLink = rowHtml.match(
      /href=["']([^"']*\/portal\/(\d+)\/bo\/bo-detail\/([^"'/?#]+)[^"']*)["']/i,
    );
    if (!detailLink || detailLink[2] !== tenant.buyerId) continue;
    const bidId = decodeHtml(detailLink[3] ?? "").trim();
    if (!bidId || seen.has(bidId)) continue;
    const row = rowFromContext(
      rowHtml,
      tenant,
      decodeHtml(detailLink[1] ?? ""),
      bidId,
    );
    if (!row) continue;
    seen.add(bidId);
    rows.push(row);
  }

  // Some PlanetBids renders flatten cards rather than table rows. Use a bounded
  // context window around public detail links as a secondary parser.
  if (rows.length === 0) {
    const linkPattern = /href=["']([^"']*\/portal\/(\d+)\/bo\/bo-detail\/([^"'/?#]+)[^"']*)["']/gi;
    for (const linkMatch of html.matchAll(linkPattern)) {
      if (linkMatch[2] !== tenant.buyerId) continue;
      const bidId = decodeHtml(linkMatch[3] ?? "").trim();
      if (!bidId || seen.has(bidId)) continue;
      const index = linkMatch.index ?? 0;
      const context = html.slice(Math.max(0, index - 1_200), index + 1_800);
      const row = rowFromContext(
        context,
        tenant,
        decodeHtml(linkMatch[1] ?? ""),
        bidId,
      );
      if (!row) continue;
      seen.add(bidId);
      rows.push(row);
    }
  }

  return rows;
}

function opportunityType(row: PlanetBidsListingRow): string {
  const value = `${row.solicitationNumber ?? ""} ${row.title}`.toLowerCase();
  if (/\brfp\b|request for proposals?/.test(value)) return "RFP";
  if (/\brfq\b|request for qualifications?/.test(value)) return "RFQ";
  if (/\brfi\b|request for information/.test(value)) return "RFI";
  return "Bid";
}

function rowToOpportunity(
  row: PlanetBidsListingRow,
  tenant: PlanetBidsTenant,
): NormalizedOpportunity {
  const postedDate = parseDate(row.postedDate);
  const responseDeadline = parseDate(row.responseDeadline);
  const stableKey = row.bidId || createHash("sha256")
    .update(`${tenant.portalId}|${row.title}|${row.responseDeadline ?? ""}`)
    .digest("hex")
    .slice(0, 16);

  return {
    externalId: `planetbids-${tenant.buyerId}-${stableKey}`,
    title: row.title,
    agency: tenant.buyerName,
    type: opportunityType(row),
    status: row.status === "closed" ? "archived" : "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline,
    placeOfPerformance: tenant.state,
    solicitationNumber: row.solicitationNumber,
    sourceUrl: row.detailUrl,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerFamily: "official_public_portal",
      providerPlatform: "planetbids",
      providerType: "planetbids_public_bid_listing",
      connectorName: "PlanetBids shared public listing adapter",
      discoveryMethod: "dedicated_official_adapter",
      sourceBadge: "PlanetBids Buyer Portal",
      sourceConfidence: "high",
      sourceId: tenant.portalId,
      tenantSlugOrId: tenant.buyerId,
      nativeOpportunityId: row.bidId,
      buyerName: tenant.buyerName,
      buyerState: tenant.state,
      listingUrl: listingUrl(tenant),
      canonicalUrl: row.detailUrl,
      listingText: row.listingText,
      documentUrls: [] as string[],
      dateUnknown: !postedDate,
      deadlineUnknown: !responseDeadline,
      collectedAt: new Date().toISOString(),
      tags: [
        "direct-official-portal",
        "planetbids-platform",
        `state:${tenant.state}`,
        `tenant:${tenant.buyerId}`,
        `portal:${tenant.portalId}`,
        ...(!postedDate ? ["date-unknown"] : []),
      ],
    },
  };
}

async function collectTenant(
  tenant: PlanetBidsTenant,
  options: FetchOptions,
): Promise<ProviderFetchResult> {
  const timeoutMs = positiveIntegerEnv(
    "PLANETBIDS_REQUEST_TIMEOUT_MS",
    DEFAULT_REQUEST_TIMEOUT_MS,
    3_000,
    60_000,
  );
  const maxRetries = positiveIntegerEnv(
    "PLANETBIDS_MAX_RETRIES",
    DEFAULT_MAX_RETRIES,
    0,
    3,
  );
  const maxResults = positiveIntegerEnv(
    "PLANETBIDS_MAX_RESULTS_PER_TENANT",
    DEFAULT_MAX_RESULTS_PER_TENANT,
    1,
    200,
  );
  const limit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
  const url = listingUrl(tenant);

  let html: string;
  try {
    html = await fetchOfficialPortalText(url, {
      label: `${tenant.portalId} PlanetBids public listing`,
      origin: PLANETBIDS_ORIGIN,
      timeoutMs,
      maxRetries,
      signal: options.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { records: [], total: 0, errors: [`${tenant.portalId}: ${reason}`] };
  }

  if (ACCESS_CHALLENGE.test(stripHtml(html))) {
    return {
      records: [],
      total: 0,
      errors: [`${tenant.portalId}: PlanetBids public listing presented an access challenge`],
    };
  }

  const parsed = parsePlanetBidsListingHtml(html, tenant);
  if (parsed.length === 0 && !EMPTY_LISTING.test(stripHtml(html))) {
    return {
      records: [],
      total: 0,
      errors: [`${tenant.portalId}: PlanetBids listing loaded but no recognizable public opportunity rows were found`],
    };
  }

  const keywords = options.keywords
    ?.toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const records = parsed
    .filter((row) => {
      if (!keywords?.length) return true;
      const haystack = `${row.title} ${row.solicitationNumber ?? ""} ${row.listingText}`.toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    })
    .map((row) => rowToOpportunity(row, tenant));
  const offset = Math.max(options.offset ?? 0, 0);
  const selected = records.slice(offset, offset + limit);
  return { records: selected, total: selected.length, errors: [] };
}

export class PlanetBidsPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private lastError?: string;
  private recordCount = 0;

  constructor(
    private readonly tenants: readonly PlanetBidsTenant[] = PLANETBIDS_TENANTS,
  ) {}

  async isConfigured(): Promise<boolean> {
    return this.tenants.length > 0;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const records: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    for (const tenant of this.tenants) {
      const result = await collectTenant(tenant, options);
      errors.push(...result.errors);
      for (const record of result.records) {
        if (seen.has(record.externalId)) continue;
        seen.add(record.externalId);
        records.push(record);
      }
    }

    this.recordCount = records.length;
    this.lastError = errors.length ? errors.join("; ") : undefined;
    if (!errors.length || records.length > 0) this.lastSuccess = new Date();
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

export function planetBidsTenantProvider(
  portalId: string,
): DataSourceProvider | undefined {
  const tenant = TENANT_BY_PORTAL_ID.get(portalId);
  return tenant ? new PlanetBidsPortalProvider([tenant]) : undefined;
}

export const planetBidsPortalProviders: Record<string, DataSourceProvider> =
  Object.fromEntries(
    PLANETBIDS_TENANTS.map((tenant) => [
      tenant.portalId,
      new PlanetBidsPortalProvider([tenant]),
    ]),
  );

export {
  listingUrl as planetBidsListingUrl,
  rowToOpportunity as planetBidsRowToOpportunity,
};
