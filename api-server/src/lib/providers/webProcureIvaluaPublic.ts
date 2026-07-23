import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { positiveIntegerEnv } from "./officialPortalHttp";
import { OfficialPlatformSession } from "./officialPlatformSession";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import {
  parseStatewideDetailHtml,
  parseStatewideListingContent,
  statewideContentLooksLikeChallenge,
  statewideMatchesOptions,
  statewideStableHash,
  statewideToOpportunity,
  type StatewideDetailRecord,
  type StatewideListingRecord,
} from "./statewideProcurementParser";
import { statewideContentHasExplicitEmptyEvidence } from "./statewideProcurementContentSignals";
import type { StatewidePortalConfig } from "./statewideProcurementConfigs";

export type WebProcureMode = "ivalua" | "power_pages" | "webprocure" | "state_html";

export interface WebProcurePublicTenant {
  portalId: string;
  buyerName: string;
  state: string;
  listingUrl: string;
  sourceBadge: string;
  mode: WebProcureMode;
  alternateListingUrls?: readonly string[];
  allowedOrigins?: readonly string[];
  customerId?: string;
  organizationId?: string;
}

const SCRIPT_LIMIT = 6;
const ENDPOINT_LIMIT = 8;
const DETAIL_LINK = /(?:solicitations?\/details?|bidboard\/bid|request_browse_public|solicitationdetails?|bidDetails?|rfp\/request_view|opportunit)/i;
const API_HINT = /(?:\/api\/|\/_api\/|\/rest\/|\/services?\/|bidboard|solicitation|public.*bid|bid.*search|request_browse_public)/i;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tenantOrigins(tenant: WebProcurePublicTenant): string[] {
  return unique([
    new URL(tenant.listingUrl).origin,
    ...(tenant.alternateListingUrls ?? []).map((value) => new URL(value).origin),
    ...(tenant.allowedOrigins ?? []).map((value) => new URL(value).origin),
  ]);
}

function asConfig(tenant: WebProcurePublicTenant): StatewidePortalConfig {
  const origin = new URL(tenant.listingUrl).origin;
  return {
    portalId: tenant.portalId,
    buyerName: tenant.buyerName,
    state: tenant.state,
    platform: tenant.mode === "state_html" ? "Pennsylvania eMarketplace" : "WebProcure / Ivalua public procurement",
    platformFamily: tenant.mode === "state_html" ? "state_html" : "webprocure_ivalua",
    listingUrl: tenant.listingUrl,
    alternateListingUrls: tenant.alternateListingUrls,
    origin,
    allowedOrigins: tenantOrigins(tenant).filter((value) => value !== origin),
    sourceBadge: tenant.sourceBadge,
    maxPages: 6,
  };
}

function sourceFor(tenant: WebProcurePublicTenant): PublicPortalSource {
  return {
    id: tenant.portalId,
    agencyName: tenant.buyerName,
    agencyType: "state",
    state: tenant.state,
    sourceUrl: tenant.listingUrl,
    searchUrl: tenant.listingUrl,
    domain: new URL(tenant.listingUrl).hostname,
    portalPlatform: tenant.mode === "state_html" ? "Pennsylvania eMarketplace" : "WebProcure / Ivalua",
    sourceLevel: "state",
    level: "state",
    accessMode: tenant.mode === "webprocure" ? "portal" : "public_html",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: tenant.mode === "state_html"
      ? "Dedicated public Pennsylvania eMarketplace parser; verified as separate from WebProcure/Ivalua."
      : "Shared stateful WebProcure/Ivalua public listing and endpoint adapter.",
  };
}

function safeUrl(value: string, pageUrl: string, origins: ReadonlySet<string>): string | undefined {
  try {
    const url = new URL(decodeHtml(value), pageUrl);
    if (!origins.has(url.origin) || !/^https?:$/.test(url.protocol)) return undefined;
    if (!url.hash.startsWith("#/")) url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function extractWebProcureDetailUrls(
  html: string,
  pageUrl: string,
  origins: readonly string[],
  limit = 50,
): string[] {
  const allowed = new Set(origins.map((value) => new URL(value).origin));
  const values: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const url = safeUrl(match[1] ?? "", pageUrl, allowed);
    if (url && DETAIL_LINK.test(url)) values.push(url);
  }
  for (const match of html.matchAll(/(?:https?:\\?\/\\?\/|\\?\/)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%\\-]{8,400}/g)) {
    const raw = (match[0] ?? "").replace(/\\\//g, "/");
    const url = safeUrl(raw, pageUrl, allowed);
    if (url && DETAIL_LINK.test(url)) values.push(url);
  }
  return unique(values).slice(0, limit);
}

function scriptUrls(html: string, pageUrl: string, origins: readonly string[]): string[] {
  const allowed = new Set(origins.map((value) => new URL(value).origin));
  const values: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
    const url = safeUrl(match[1] ?? "", pageUrl, allowed);
    if (url) values.push(url);
  }
  return unique(values).slice(0, SCRIPT_LIMIT);
}

function endpointScore(value: string): number {
  const lower = value.toLowerCase();
  let score = 0;
  if (/\/api\/|\/_api\/|\/rest\//.test(lower)) score += 5;
  if (/solicitation|bidboard|opportunit|request/.test(lower)) score += 4;
  if (/public/.test(lower)) score += 2;
  if (/search|list|browse/.test(lower)) score += 2;
  if (/\.js(?:$|\?)/.test(lower)) score -= 5;
  return score;
}

export function extractWebProcureEndpointCandidates(
  script: string,
  scriptUrl: string,
  origins: readonly string[],
  tenant: Pick<WebProcurePublicTenant, "customerId" | "organizationId">,
): string[] {
  const allowed = new Set(origins.map((value) => new URL(value).origin));
  const rawValues: string[] = [];
  for (const match of script.matchAll(/["'`]((?:https?:\/\/|\/)[^"'`\s]{4,300})["'`]/g)) {
    const raw = match[1] ?? "";
    if (API_HINT.test(raw) && !/[{}<>]/.test(raw)) rawValues.push(raw);
  }

  const candidates: string[] = [];
  for (const raw of rawValues) {
    const safe = safeUrl(raw, scriptUrl, allowed);
    if (!safe) continue;
    const url = new URL(safe);
    if (tenant.customerId && !url.searchParams.has("customerid")) url.searchParams.set("customerid", tenant.customerId);
    if (tenant.organizationId && !url.searchParams.has("oid")) url.searchParams.set("oid", tenant.organizationId);
    candidates.push(url.toString());
  }
  return unique(candidates)
    .sort((left, right) => endpointScore(right) - endpointScore(left))
    .slice(0, ENDPOINT_LIMIT);
}

function parseRows(
  content: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  pageNumber: number,
): StatewideListingRecord[] {
  return parseStatewideListingContent(content, config, pageUrl, pageNumber);
}

function listingFromDetail(
  detail: StatewideDetailRecord,
  detailUrl: string,
  tenant: WebProcurePublicTenant,
  pageNumber: number,
): StatewideListingRecord | undefined {
  const title = detail.title?.trim();
  if (!title) return undefined;
  const nativeId = detail.solicitationNumber?.trim()
    || new URL(detailUrl).searchParams.get("id")
    || detailUrl.match(/bidboard\/bid\/(\d+)/i)?.[1]
    || statewideStableHash(`${tenant.portalId}|${detailUrl}|${title}`);
  return {
    nativeId,
    title,
    agency: detail.agency || tenant.buyerName,
    department: detail.department,
    status: detail.status,
    postedDate: detail.postedDate,
    responseDeadline: detail.responseDeadline,
    solicitationNumber: detail.solicitationNumber || nativeId,
    type: detail.type,
    description: detail.description,
    detailUrl,
    documentUrls: detail.documentUrls,
    listingPage: pageNumber,
  };
}

export class WebProcureIvaluaPublicProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(readonly tenant: WebProcurePublicTenant) {}

  async isConfigured(): Promise<boolean> {
    return Boolean(this.tenant.portalId && this.tenant.state.length === 2 && /^https:\/\//.test(this.tenant.listingUrl));
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("WEBPROCURE_REQUEST_TIMEOUT_MS", 20_000, 3_000, 45_000);
    const maxRetries = positiveIntegerEnv("WEBPROCURE_MAX_RETRIES", 1, 0, 2);
    const maxResults = positiveIntegerEnv("WEBPROCURE_MAX_RESULTS", 150, 1, 500);
    const detailLimit = positiveIntegerEnv("WEBPROCURE_DETAIL_LIMIT", 12, 0, 50);
    const offset = Math.max(options.offset ?? 0, 0);
    const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    const targetCount = Math.min(maxResults, offset + requestedLimit);
    const origins = tenantOrigins(this.tenant);
    const config = asConfig(this.tenant);
    const session = new OfficialPlatformSession(origins, `${this.tenant.portalId} ${this.tenant.mode}`);
    const listings = new Map<string, StatewideListingRecord>();
    const detailUrls = new Set<string>();
    const endpointUrls = new Set<string>();
    const errors: string[] = [];
    let explicitEmpty = false;
    let challenge = false;

    const addRows = (content: string, url: string, pageNumber: number): void => {
      for (const row of parseRows(content, config, url, pageNumber)) {
        if (!listings.has(row.nativeId.toLowerCase())) listings.set(row.nativeId.toLowerCase(), row);
      }
      for (const detailUrl of extractWebProcureDetailUrls(content, url, origins, targetCount * 2)) {
        detailUrls.add(detailUrl);
      }
    };

    const pages = [this.tenant.listingUrl, ...(this.tenant.alternateListingUrls ?? [])];
    for (const [index, pageUrl] of pages.entries()) {
      if (listings.size >= targetCount) break;
      try {
        const page = await session.requestText(pageUrl, {
          timeoutMs,
          maxRetries,
          signal: options.signal,
        });
        addRows(page.body, page.url, index + 1);
        explicitEmpty ||= statewideContentHasExplicitEmptyEvidence(page.body);
        challenge ||= statewideContentLooksLikeChallenge(page.body);

        if (!listings.size && this.tenant.mode !== "state_html") {
          for (const assetUrl of scriptUrls(page.body, page.url, origins)) {
            try {
              const asset = await session.requestText(assetUrl, {
                timeoutMs,
                maxRetries: 0,
                signal: options.signal,
              });
              for (const candidate of extractWebProcureEndpointCandidates(
                asset.body.slice(0, 2_000_000),
                asset.url,
                origins,
                this.tenant,
              )) endpointUrls.add(candidate);
            } catch (error) {
              errors.push(`${this.tenant.portalId}: script inspection failed for ${assetUrl}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      } catch (error) {
        errors.push(`${this.tenant.portalId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const [index, endpoint] of Array.from(endpointUrls).slice(0, ENDPOINT_LIMIT).entries()) {
      if (listings.size >= targetCount) break;
      try {
        const result = await session.requestText(endpoint, {
          headers: { accept: "application/json,text/plain,*/*" },
          timeoutMs,
          maxRetries: 0,
          signal: options.signal,
        });
        addRows(result.body, result.url, pages.length + index + 1);
      } catch (error) {
        errors.push(`${this.tenant.portalId}: structured endpoint ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const [index, detailUrl] of Array.from(detailUrls).slice(0, detailLimit).entries()) {
      if (listings.size >= targetCount) break;
      const fetchUrl = detailUrl.includes("#/bidboard/bid/") ? undefined : detailUrl;
      if (!fetchUrl) continue;
      try {
        const result = await session.requestText(fetchUrl, {
          timeoutMs,
          maxRetries,
          signal: options.signal,
        });
        const detail = parseStatewideDetailHtml(result.body, config, result.url);
        const row = listingFromDetail(detail, result.url, this.tenant, index + 1);
        if (row && !listings.has(row.nativeId.toLowerCase())) listings.set(row.nativeId.toLowerCase(), row);
      } catch (error) {
        errors.push(`${this.tenant.portalId}: detail ${detailUrl} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const normalized = Array.from(listings.values())
      .map((row) => statewideToOpportunity(config, row))
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => statewideMatchesOptions(record, options))
      .slice(offset, offset + requestedLimit);

    this.recordCount = normalized.length;
    if (normalized.length || explicitEmpty) {
      this.lastError = undefined;
      this.lastSuccess = new Date();
      return { records: normalized, total: normalized.length, errors: normalized.length ? errors : [] };
    }

    const reason = errors.join("; ")
      || `${this.tenant.portalId}: ${this.tenant.mode} public routes returned no parseable opportunity rows${challenge ? " after a browser or login challenge" : ""}`;
    this.lastError = reason;
    return { records: [], total: 0, errors: [reason] };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: await this.isConfigured(),
      healthy: !this.lastError,
      errorMessage: this.lastError,
      lastAttempt: this.lastAttempt,
      lastSuccess: this.lastSuccess,
      recordCount: this.recordCount,
    };
  }
}

export const WEBPROCURE_IVALUA_TENANTS: readonly WebProcurePublicTenant[] = [
  {
    portalId: "az-app",
    buyerName: "State of Arizona",
    state: "AZ",
    listingUrl: "https://app.az.gov/page.aspx/en/rfp/request_browse_public",
    sourceBadge: "Arizona Procurement Portal",
    mode: "ivalua",
  },
  {
    portalId: "nc-evp",
    buyerName: "State of North Carolina",
    state: "NC",
    listingUrl: "https://evp.nc.gov/solicitations/",
    sourceBadge: "North Carolina eVP",
    mode: "power_pages",
  },
  {
    portalId: "ri-bids",
    buyerName: "State of Rhode Island",
    state: "RI",
    listingUrl: "https://webprocure.proactiscloud.com/wp-web-public/en/?customerid=46",
    alternateListingUrls: ["https://ridop.ri.gov/vendors/bidding-opportunities"],
    allowedOrigins: ["https://ridop.ri.gov"],
    sourceBadge: "Ocean State Procures Public Bid Board",
    mode: "webprocure",
    customerId: "46",
    organizationId: "120002",
  },
  {
    portalId: "pa-emarketplace",
    buyerName: "Commonwealth of Pennsylvania",
    state: "PA",
    listingUrl: "https://www.emarketplace.state.pa.us/Solicitations.aspx",
    alternateListingUrls: ["https://www.emarketplace.state.pa.us/Search.aspx"],
    sourceBadge: "Pennsylvania eMarketplace",
    mode: "state_html",
  },
] as const;

export const WEBPROCURE_IVALUA_SOURCES: PublicPortalSource[] = WEBPROCURE_IVALUA_TENANTS.map(sourceFor);
export const webProcureIvaluaProviders: Record<string, DataSourceProvider> = Object.fromEntries(
  WEBPROCURE_IVALUA_TENANTS.map((tenant) => [tenant.portalId, new WebProcureIvaluaPublicProvider(tenant)]),
);
