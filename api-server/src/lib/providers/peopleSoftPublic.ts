import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { positiveIntegerEnv } from "./officialPortalHttp";
import { OfficialPlatformSession, type PlatformResponse } from "./officialPlatformSession";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import {
  parseStatewidePlatformListings,
} from "./statewideProcurementPlatformParsers";
import {
  parseStatewideListingContent,
  statewideContentLooksLikeChallenge,
  statewideHtmlToText,
  statewideMatchesOptions,
  statewideStableHash,
  statewideToOpportunity,
  type StatewideListingRecord,
} from "./statewideProcurementParser";
import { statewideContentHasExplicitEmptyEvidence } from "./statewideProcurementContentSignals";
import type { StatewidePortalConfig } from "./statewideProcurementConfigs";
import { minnesotaOspProvider } from "./minnesotaOsp";

export interface PeopleSoftPublicTenant {
  portalId: string;
  buyerName: string;
  state: string;
  listingUrl: string;
  sourceBadge: string;
  alternateListingUrls?: readonly string[];
  /** Public same-origin pages that can establish a PeopleSoft routing/session cookie. */
  bootstrapUrls?: readonly string[];
  fallbackUrls?: readonly string[];
  fallbackProvider?: DataSourceProvider;
  maxPages?: number;
}

interface PeopleSoftForm {
  actionUrl: string;
  fields: Map<string, string>;
}

const COOKIE_ERROR = /cookies enabled|errorPg=ckreq|return to sign in with cookies enabled/i;
const LOGIN_PAGE = /PeopleSoft Sign-in|cmd=login|name=["']userid["']|name=["']pwd["']/i;
const NEXT_ACTION = /(?:\$hdown\$|\$next\$|next|pgnext|pgbrk)/i;
const SEARCH_ACTION = /(?:search|find|view|refresh|bid|event|solicitation|SCP_PUB|WI_SS)/i;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2];
  if (quoted !== undefined) return decodeHtml(quoted);
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, "i"))?.[1];
}

export function parsePeopleSoftHiddenFields(html: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const name = attribute(tag, "name");
    if (!name) continue;
    const type = (attribute(tag, "type") ?? "text").toLowerCase();
    if (type !== "hidden") continue;
    fields.set(name, attribute(tag, "value") ?? "");
  }
  return fields;
}

function parseForm(html: string, pageUrl: string): PeopleSoftForm | undefined {
  const forms = Array.from(html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi));
  const selected = forms.find((match) => /\b(?:ICSID|ICStateNum|ICAction|ICElementNum)\b/i.test(match[0]))
    ?? forms.find((match) => /PeopleSoft|submitAction_/i.test(match[0]));
  if (!selected) return undefined;
  const openTag = selected[0].match(/<form\b[^>]*>/i)?.[0] ?? "";
  const action = attribute(openTag, "action") || pageUrl;
  return {
    actionUrl: new URL(action, pageUrl).toString(),
    fields: parsePeopleSoftHiddenFields(selected[0]),
  };
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

export function extractPeopleSoftSubmitActions(html: string): string[] {
  const actions: string[] = [];
  for (const match of html.matchAll(/submitAction_[^(]*\([^,]+,\s*["']([^"']+)["']/gi)) {
    if (match[1]) actions.push(decodeHtml(match[1]));
  }
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const name = attribute(tag, "name");
    const value = attribute(tag, "value") ?? "";
    if (name && /button|submit/i.test(attribute(tag, "type") ?? "") && /search|view|bid|event|next/i.test(`${name} ${value}`)) {
      actions.push(name);
    }
  }
  return unique(actions);
}

function partitionActions(actions: readonly string[]): {
  next: string[];
  search: string[];
} {
  return {
    next: actions.filter((action) => NEXT_ACTION.test(action)),
    search: actions.filter((action) => !NEXT_ACTION.test(action) && SEARCH_ACTION.test(action)),
  };
}

function asStatewideConfig(tenant: PeopleSoftPublicTenant): StatewidePortalConfig {
  const listingOrigin = new URL(tenant.listingUrl).origin;
  const allowedOrigins = unique([
    listingOrigin,
    ...(tenant.alternateListingUrls ?? []).map((value) => new URL(value).origin),
    ...(tenant.bootstrapUrls ?? []).map((value) => new URL(value).origin),
    ...(tenant.fallbackUrls ?? []).map((value) => new URL(value).origin),
  ]).filter((value) => value !== listingOrigin);
  return {
    portalId: tenant.portalId,
    buyerName: tenant.buyerName,
    state: tenant.state,
    platform: "PeopleSoft public supplier portal",
    platformFamily: "peoplesoft",
    listingUrl: tenant.listingUrl,
    alternateListingUrls: tenant.alternateListingUrls,
    origin: listingOrigin,
    allowedOrigins,
    sourceBadge: tenant.sourceBadge,
    maxPages: tenant.maxPages,
  };
}

function sourceFor(tenant: PeopleSoftPublicTenant): PublicPortalSource {
  return {
    id: tenant.portalId,
    agencyName: tenant.buyerName,
    agencyType: "state",
    state: tenant.state,
    sourceUrl: tenant.listingUrl,
    searchUrl: tenant.listingUrl,
    domain: new URL(tenant.listingUrl).hostname,
    portalPlatform: "PeopleSoft public supplier portal",
    sourceLevel: "state",
    level: "state",
    accessMode: "portal",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Shared stateful PeopleSoft public bid-list adapter with cookie, hidden-state, and postback support.",
  };
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parsePeopleSoftDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/\b(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|ET|CT|MT|PT)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const dateOnly = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(cleaned)
    || /^\d{4}-\d{1,2}-\d{1,2}$/.test(cleaned);
  const parsed = new Date(endOfDay && dateOnly ? `${cleaned} 23:59:59.999` : cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function peopleSoftType(title: string): string {
  if (/\brfp\b|request for proposals?/i.test(title)) return "RFP";
  if (/\brfq\b|request for (?:qualifications?|quotations?)/i.test(title)) return "RFQ";
  if (/\brfi\b|request for information/i.test(title)) return "RFI";
  if (/\b(?:ifb|itb)\b|invitation (?:for|to) bids?/i.test(title)) return "Bid";
  return "Solicitation";
}

/**
 * PeopleSoft frequently renders a public event grid whose Details control is a
 * JavaScript postback instead of a crawlable href. The generic statewide parser
 * intentionally rejects javascript: URLs, so read the authoritative visible
 * grid columns directly and keep the listing page as source evidence.
 */
export function parsePeopleSoftVisibleRows(
  html: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  pageNumber: number,
): StatewideListingRecord[] {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((match) => match[0]);
  let headers: string[] = [];
  const records: StatewideListingRecord[] = [];

  for (const row of rows) {
    const cells = Array.from(
      row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi),
    ).map((match) => statewideHtmlToText(match[1] ?? ""));
    if (!cells.length) continue;

    const normalizedCells = cells.map(normalizedHeader);
    const headerLike =
      /<th\b/i.test(row) ||
      (normalizedCells.some((cell) => /^(?:event|bid|solicitation) name$/.test(cell)) &&
        normalizedCells.some((cell) => /^(?:event|bid|solicitation) (?:id|number|no)$/.test(cell)));
    if (headerLike) {
      headers = normalizedCells;
      continue;
    }
    if (!headers.length) continue;

    const indexOf = (...patterns: RegExp[]): number =>
      headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    const at = (index: number): string | undefined =>
      index >= 0 ? cells[index]?.replace(/\s+/g, " ").trim() || undefined : undefined;

    const title = at(indexOf(/^(?:event|bid|solicitation) name$/, /^description$/, /^title$/));
    const agency = at(indexOf(/^business unit$/, /agency/, /department/, /organization/));
    const exposedId = at(indexOf(/^(?:event|bid|solicitation) (?:id|number|no)$/));
    const postedDate = parsePeopleSoftDate(
      at(indexOf(/^start date$/, /posted/, /publish/, /issue date/)),
    );
    const responseDeadline = parsePeopleSoftDate(
      at(indexOf(/^end date$/, /closing/, /due date/, /response deadline/)),
      true,
    );

    if (!title || !exposedId) continue;
    if (responseDeadline && responseDeadline.getTime() < Date.now()) continue;

    const nativeId = !/^(?:n\/?a|none|-+)$/i.test(exposedId)
      ? exposedId
      : statewideStableHash(
          `${config.portalId}|${title}|${agency ?? ""}|${responseDeadline?.toISOString() ?? ""}`,
        );
    records.push({
      nativeId,
      title,
      agency: agency || config.buyerName,
      department: agency || undefined,
      status: "Open",
      postedDate,
      responseDeadline,
      solicitationNumber: nativeId,
      type: peopleSoftType(title),
      detailUrl: pageUrl,
      documentUrls: [],
      listingPage: pageNumber,
    });
  }
  return records;
}

function parseRows(
  html: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  pageNumber: number,
): StatewideListingRecord[] {
  const byId = new Map<string, StatewideListingRecord>();
  for (const row of [
    ...parseStatewideListingContent(html, config, pageUrl, pageNumber),
    ...parseStatewidePlatformListings(html, config, pageUrl, pageNumber),
    ...parsePeopleSoftVisibleRows(html, config, pageUrl, pageNumber),
  ]) {
    if (!byId.has(row.nativeId.toLowerCase())) byId.set(row.nativeId.toLowerCase(), row);
  }
  return Array.from(byId.values());
}

function requestBody(form: PeopleSoftForm, action: string): string {
  const values = new URLSearchParams();
  for (const [name, value] of form.fields) values.set(name, value);
  values.set("ICAction", action);
  if (!values.has("ICStateNum")) values.set("ICStateNum", "1");
  if (!values.has("ICElementNum")) values.set("ICElementNum", "0");
  if (!values.has("ICResubmit")) values.set("ICResubmit", "0");
  if (!values.has("ICChanged")) values.set("ICChanged", "-1");
  return values.toString();
}

async function requestPeopleSoftPublicPage(
  session: OfficialPlatformSession,
  tenant: PeopleSoftPublicTenant,
  seed: string,
  options: FetchOptions,
  timeoutMs: number,
  maxRetries: number,
): Promise<{ page: PlatformResponse; cookieRecoveryAttempted: boolean }> {
  const request = () =>
    session.requestText(seed, {
      timeoutMs,
      maxRetries,
      signal: options.signal,
    });

  let page = await request();
  if (!COOKIE_ERROR.test(page.body)) {
    return { page, cookieRecoveryAttempted: false };
  }

  // Cookie-check redirects often establish the routing/session cookie expected
  // on the next public request. Replay once in the same stateful session.
  page = await request();
  if (!COOKIE_ERROR.test(page.body)) {
    return { page, cookieRecoveryAttempted: true };
  }

  // A few public tenants require one public landing request before the bid list
  // accepts the cookie. URLs are explicit per tenant; no login automation occurs.
  for (const bootstrapUrl of tenant.bootstrapUrls ?? []) {
    await session.requestText(bootstrapUrl, {
      timeoutMs,
      maxRetries,
      signal: options.signal,
    });
    page = await request();
    if (!COOKIE_ERROR.test(page.body)) break;
  }

  return { page, cookieRecoveryAttempted: true };
}

export class PeopleSoftPublicProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(readonly tenant: PeopleSoftPublicTenant) {}

  async isConfigured(): Promise<boolean> {
    return Boolean(this.tenant.portalId && this.tenant.state.length === 2 && /^https:\/\//.test(this.tenant.listingUrl));
  }

  private async fetchFallback(
    options: FetchOptions,
    config: StatewidePortalConfig,
    session: OfficialPlatformSession,
    timeoutMs: number,
    maxRetries: number,
    errors: string[],
  ): Promise<NormalizedOpportunity[]> {
    const rows = new Map<string, StatewideListingRecord>();
    for (const [index, url] of (this.tenant.fallbackUrls ?? []).entries()) {
      try {
        const result = await session.requestText(url, {
          timeoutMs,
          maxRetries,
          signal: options.signal,
        });
        for (const row of parseRows(result.body, config, result.url, index + 1)) {
          if (!rows.has(row.nativeId.toLowerCase())) rows.set(row.nativeId.toLowerCase(), row);
        }
      } catch (error) {
        errors.push(`${this.tenant.portalId}: fallback ${url} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const normalized = Array.from(rows.values())
      .map((row) => statewideToOpportunity(config, row))
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => statewideMatchesOptions(record, options));
    if (normalized.length) return normalized;

    if (this.tenant.fallbackProvider) {
      const fallback = await this.tenant.fallbackProvider.fetch(options);
      errors.push(...fallback.errors.map((error) => `${this.tenant.portalId}: fallback provider: ${error}`));
      return fallback.records;
    }
    return [];
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("PEOPLESOFT_REQUEST_TIMEOUT_MS", 20_000, 3_000, 45_000);
    const maxRetries = positiveIntegerEnv("PEOPLESOFT_MAX_RETRIES", 1, 0, 2);
    const maxResults = positiveIntegerEnv("PEOPLESOFT_MAX_RESULTS", 150, 1, 500);
    const maxPages = Math.min(Math.max(this.tenant.maxPages ?? 5, 1), 10);
    const offset = Math.max(options.offset ?? 0, 0);
    const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    const targetCount = Math.min(maxResults, offset + requestedLimit);
    const config = asStatewideConfig(this.tenant);
    const origins = [config.origin, ...(config.allowedOrigins ?? [])];
    const session = new OfficialPlatformSession(origins, `${this.tenant.portalId} PeopleSoft`);
    const errors: string[] = [];
    const listings = new Map<string, StatewideListingRecord>();
    const attemptedActions = new Set<string>();
    let explicitEmpty = false;
    let blocked = false;

    const addRows = (html: string, url: string, pageNumber: number): void => {
      for (const row of parseRows(html, config, url, pageNumber)) {
        if (!listings.has(row.nativeId.toLowerCase())) listings.set(row.nativeId.toLowerCase(), row);
      }
    };

    for (const seed of [this.tenant.listingUrl, ...(this.tenant.alternateListingUrls ?? [])]) {
      if (listings.size >= targetCount) break;
      let page: PlatformResponse;
      let cookieRecoveryAttempted = false;
      try {
        const result = await requestPeopleSoftPublicPage(
          session,
          this.tenant,
          seed,
          options,
          timeoutMs,
          maxRetries,
        );
        page = result.page;
        cookieRecoveryAttempted = result.cookieRecoveryAttempted;
      } catch (error) {
        errors.push(`${this.tenant.portalId}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      if (COOKIE_ERROR.test(page.body)) {
        errors.push(
          `${this.tenant.portalId}: PeopleSoft cookie-check redirect persisted after ${cookieRecoveryAttempted ? "bounded cookie/session recovery" : "stateful session initialization"}`,
        );
        blocked = true;
        continue;
      }
      if (statewideContentLooksLikeChallenge(page.body) || LOGIN_PAGE.test(page.body)) {
        errors.push(`${this.tenant.portalId}: PeopleSoft public route returned a login or anti-bot challenge`);
        blocked = true;
        continue;
      }

      addRows(page.body, page.url, 1);
      explicitEmpty ||= statewideContentHasExplicitEmptyEvidence(page.body);
      let currentHtml = page.body;
      let currentUrl = page.url;
      let form = parseForm(currentHtml, currentUrl);

      if (!listings.size && form) {
        const { search } = partitionActions(extractPeopleSoftSubmitActions(currentHtml));
        for (const action of search.slice(0, 3)) {
          const key = action.toLowerCase();
          if (attemptedActions.has(key)) continue;
          attemptedActions.add(key);
          try {
            const result = await session.requestText(form.actionUrl, {
              method: "POST",
              headers: {
                "content-type": "application/x-www-form-urlencoded",
                origin: new URL(form.actionUrl).origin,
                referer: currentUrl,
              },
              body: requestBody(form, action),
              timeoutMs,
              maxRetries,
              signal: options.signal,
            });
            currentHtml = result.body;
            currentUrl = result.url;
            form = parseForm(currentHtml, currentUrl) ?? form;
            addRows(currentHtml, currentUrl, 1);
            explicitEmpty ||= statewideContentHasExplicitEmptyEvidence(currentHtml);
            if (listings.size) break;
          } catch (error) {
            errors.push(`${this.tenant.portalId}: PeopleSoft action ${action} failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      for (let pageNumber = 2; pageNumber <= maxPages && form && listings.size < targetCount; pageNumber += 1) {
        const { next } = partitionActions(extractPeopleSoftSubmitActions(currentHtml));
        const action = next.find((candidate) => !attemptedActions.has(candidate.toLowerCase()));
        if (!action) break;
        attemptedActions.add(action.toLowerCase());
        try {
          const result = await session.requestText(form.actionUrl, {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              origin: new URL(form.actionUrl).origin,
              referer: currentUrl,
            },
            body: requestBody(form, action),
            timeoutMs,
            maxRetries,
            signal: options.signal,
          });
          currentHtml = result.body;
          currentUrl = result.url;
          form = parseForm(currentHtml, currentUrl) ?? form;
          const before = listings.size;
          addRows(currentHtml, currentUrl, pageNumber);
          if (listings.size === before) break;
        } catch (error) {
          errors.push(`${this.tenant.portalId}: PeopleSoft pagination ${action} failed: ${error instanceof Error ? error.message : String(error)}`);
          break;
        }
      }
    }

    let records = Array.from(listings.values())
      .map((row) => statewideToOpportunity(config, row))
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => statewideMatchesOptions(record, options));

    if (!records.length) {
      records = await this.fetchFallback(options, config, session, timeoutMs, maxRetries, errors);
    }

    records = records.slice(offset, offset + requestedLimit);
    this.recordCount = records.length;
    if (records.length || explicitEmpty) {
      this.lastError = undefined;
      this.lastSuccess = new Date();
      return { records, total: records.length, errors: records.length ? errors : [] };
    }

    const reason = errors.join("; ")
      || `${this.tenant.portalId}: PeopleSoft public routes returned no parseable opportunity rows${blocked ? " after a public-access challenge" : ""}`;
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

export const PEOPLESOFT_TENANTS: readonly PeopleSoftPublicTenant[] = [
  {
    portalId: "ok-omes",
    buyerName: "State of Oklahoma",
    state: "OK",
    listingUrl: "https://financials.ok.gov/psc/SOKLFP1DS/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL",
    sourceBadge: "Oklahoma OMES Solicitations",
    fallbackUrls: ["https://oklahoma.gov/omes/divisions/central-purchasing/solicitations.html"],
    maxPages: 6,
  },
  {
    portalId: "tn-edison",
    buyerName: "State of Tennessee",
    state: "TN",
    listingUrl: "https://hub.edison.tn.gov/psc/fsprd/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL",
    sourceBadge: "Tennessee Edison Bid Opportunities",
    fallbackUrls: [
      "https://www.tn.gov/generalservices/procurement/central-procurement-office--cpo-/supplier-information/request-for-proposals--rfp--opportunities1.html",
      "https://www.tn.gov/generalservices/procurement/central-procurement-office--cpo-/supplier-information/invitations-to-bid--itb-.html",
    ],
    maxPages: 6,
  },
  {
    portalId: "wi-vendornet",
    buyerName: "State of Wisconsin",
    state: "WI",
    listingUrl: "https://esupplier.wi.gov/psc/esupplier_4/SUPPLIER/ERP/c/WI_SS_SELF_SERVICE.WI_SS_BIDDER_BIDS.GBL?page=WI_SS_BIDDER_BIDS",
    alternateListingUrls: [
      "https://esupplier.wi.gov/psc/esupplier_3/SUPPLIER/ERP/c/WI_SS_SELF_SERVICE.WI_SS_BIDDER_BIDS.GBL?page=WI_SS_BIDDER_BIDS",
      "https://esupplier.wi.gov/psc/esupplier_5/SUPPLIER/ERP/c/WI_SS_SELF_SERVICE.WI_SS_PGLT_CURSOL.GBL",
    ],
    sourceBadge: "Wisconsin eSupplier Search Solicitations",
    maxPages: 6,
  },
  {
    portalId: "ks-esupplier",
    buyerName: "State of Kansas",
    state: "KS",
    listingUrl: "https://supplier.sok.ks.gov/psc/sokfsprdsup_1/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL",
    alternateListingUrls: [
      "https://supplier.sok.ks.gov/psc/sokfsprdsup/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL",
      "https://supplier.sok.ks.gov/psc/sokfsprdsup/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL9?PAGE=SCP_PUB_BIDLIST_FL",
      "https://supplier.sok.ks.gov/psc/sokfsprdsup/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL7?PAGE=SCP_PUB_BIDLIST_FL",
    ],
    bootstrapUrls: [
      "https://supplier.sok.ks.gov/psc/sokfsprdsup/SUPPLIER/ERP/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL",
    ],
    sourceBadge: "Kansas eSupplier Bid Opportunities",
    maxPages: 6,
  },
  {
    portalId: "mn-swift",
    buyerName: "State of Minnesota",
    state: "MN",
    listingUrl: "https://guest.supplier.systems.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL",
    sourceBadge: "Minnesota SWIFT Public Events",
    fallbackProvider: minnesotaOspProvider,
    maxPages: 6,
  },
] as const;

export const PEOPLE_SOFT_SOURCES: PublicPortalSource[] = PEOPLESOFT_TENANTS.map(sourceFor);
export const peopleSoftPublicProviders: Record<string, DataSourceProvider> = Object.fromEntries(
  PEOPLESOFT_TENANTS.map((tenant) => [tenant.portalId, new PeopleSoftPublicProvider(tenant)]),
);
