import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import { positiveIntegerEnv } from "./officialPortalHttp";
import { OfficialPlatformSession } from "./officialPlatformSession";
import {
  PeopleSoftPublicProvider,
  type PeopleSoftPublicTenant,
} from "./peopleSoftPublic";
import {
  parseStatewideListingContent,
  statewideMatchesOptions,
  statewideStableHash,
  statewideToOpportunity,
  type StatewideListingRecord,
} from "./statewideProcurementParser";
import type { StatewidePortalConfig } from "./statewideProcurementConfigs";

interface OfficialAvailabilityTenant {
  portalId: string;
  buyerName: string;
  state: string;
  platform: string;
  sourceBadge: string;
  urls: readonly string[];
  primaryProvider: DataSourceProvider;
  parser?: (html: string, pageUrl: string, config: StatewidePortalConfig) => StatewideListingRecord[];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function text(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|td|th|section|article|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  ).replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseDate(value?: string, endOfDay = false): Date | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value
    .replace(/\b(?:EST|EDT|CST|CDT|PST|PDT|ET|CT|PT)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const dateOnly = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(cleaned)
    || /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(cleaned);
  const parsed = new Date(endOfDay && dateOnly ? `${cleaned} 23:59:59.999` : cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function labelValue(value: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:?\\s*([^\\n]+)`, "i"))?.[1]?.trim();
}

function typeFromTitle(title: string): string {
  if (/\brfp\b|request for proposals?/i.test(title)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotations?/i.test(title)) return "RFQ";
  if (/\brfi\b|request for information/i.test(title)) return "RFI";
  if (/\b(?:ifb|itb|rfb)\b|invitation (?:for|to) bids?|request for bids?/i.test(title)) return "Bid";
  return "Solicitation";
}

function westVirginiaNotices(
  html: string,
  pageUrl: string,
  config: StatewidePortalConfig,
): StatewideListingRecord[] {
  const headings = Array.from(html.matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi));
  const records: StatewideListingRecord[] = [];
  for (const [index, heading] of headings.entries()) {
    const title = text(heading[1] ?? "");
    if (!title || /bids received|recently closed|bid awards|contracts awarded/i.test(title)) continue;
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const block = text(html.slice(start, end));
    const solicitationNumber = labelValue(block, "Requisition Number")
      || labelValue(block, "Solicitation Number");
    if (!solicitationNumber || !/\b(?:solicit|bid|proposal|project|contract)\b/i.test(`${title} ${block}`)) continue;
    const deadline = parseDate(
      labelValue(block, "Closing Date")
      || labelValue(block, "Bid Opening Date")
      || labelValue(block, "Due Date"),
      true,
    );
    if (deadline && deadline.getTime() < Date.now()) continue;
    records.push({
      nativeId: solicitationNumber,
      title,
      agency: config.buyerName,
      department: labelValue(block, "Division/Office"),
      status: "Open",
      postedDate: parseDate(labelValue(block, "Posted")),
      responseDeadline: deadline,
      solicitationNumber,
      type: typeFromTitle(title),
      description: block.slice(0, 2_000),
      detailUrl: pageUrl,
      documentUrls: [],
      listingPage: 1,
    });
  }
  return records;
}

function vendorNetRows(
  html: string,
  pageUrl: string,
  config: StatewidePortalConfig,
): StatewideListingRecord[] {
  const records = parseStatewideListingContent(html, config, pageUrl, 1);
  if (records.length) return records;

  const seen = new Set<string>();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = row[0];
    const anchor = rowHtml.match(/<a\b[^>]*href=["']([^"']*Bid\.aspx\?[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const detailUrl = new URL(decodeHtml(anchor[1] ?? ""), pageUrl).toString();
    const url = new URL(detailUrl);
    if (url.origin !== new URL(pageUrl).origin) continue;
    const nativeId = url.searchParams.get("Id") || url.searchParams.get("name")
      || statewideStableHash(detailUrl);
    if (seen.has(nativeId.toLowerCase())) continue;
    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => text(match[1] ?? ""));
    const anchorText = text(anchor[2] ?? "");
    const title = anchorText || cells.find((cell) => cell.length > 8 && !/^\d{1,2}[/-]/.test(cell));
    if (!title) continue;
    const dateValues = cells.filter((cell) => /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(cell));
    const deadline = parseDate(dateValues.at(-1), true);
    if (deadline && deadline.getTime() < Date.now()) continue;
    seen.add(nativeId.toLowerCase());
    records.push({
      nativeId,
      title,
      agency: config.buyerName,
      status: "Open",
      postedDate: parseDate(dateValues[0]),
      responseDeadline: deadline,
      solicitationNumber: url.searchParams.get("name") || nativeId,
      type: typeFromTitle(title),
      detailUrl,
      documentUrls: [],
      listingPage: 1,
    });
  }
  return records;
}

function sourceFor(tenant: OfficialAvailabilityTenant): PublicPortalSource {
  return {
    id: tenant.portalId,
    agencyName: tenant.buyerName,
    agencyType: "state",
    state: tenant.state,
    sourceUrl: tenant.urls[0]!,
    searchUrl: tenant.urls[0]!,
    domain: new URL(tenant.urls[0]!).hostname,
    portalPlatform: tenant.platform,
    sourceLevel: "state",
    level: "state",
    accessMode: "portal",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: `Shared platform adapter with official availability route for ${tenant.sourceBadge}.`,
  };
}

function configFor(tenant: OfficialAvailabilityTenant): StatewidePortalConfig {
  const origin = new URL(tenant.urls[0]!).origin;
  return {
    portalId: tenant.portalId,
    buyerName: tenant.buyerName,
    state: tenant.state,
    platform: tenant.platform,
    platformFamily: tenant.portalId === "or-oregonbuys" ? "periscope_bso"
      : tenant.portalId === "wi-vendornet" ? "peoplesoft"
      : "cgi_advantage",
    listingUrl: tenant.urls[0]!,
    alternateListingUrls: tenant.urls.slice(1),
    origin,
    allowedOrigins: Array.from(new Set(tenant.urls.slice(1).map((url) => new URL(url).origin))).filter((value) => value !== origin),
    sourceBadge: tenant.sourceBadge,
  };
}

export class OfficialAvailabilityProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(readonly tenant: OfficialAvailabilityTenant) {}

  async isConfigured(): Promise<boolean> {
    return Boolean(this.tenant.portalId && this.tenant.urls.length && this.tenant.state.length === 2);
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("PLATFORM_AVAILABILITY_TIMEOUT_MS", 9_000, 3_000, 15_000);
    const maxResults = positiveIntegerEnv("PLATFORM_AVAILABILITY_MAX_RESULTS", 100, 1, 250);
    const offset = Math.max(options.offset ?? 0, 0);
    const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    const config = configFor(this.tenant);
    const origins = [config.origin, ...(config.allowedOrigins ?? [])];
    const session = new OfficialPlatformSession(origins, `${this.tenant.portalId} official availability`);
    const errors: string[] = [];
    const rows = new Map<string, StatewideListingRecord>();
    let reachedOfficialPage = false;

    for (const url of this.tenant.urls) {
      try {
        const response = await session.requestText(url, {
          timeoutMs,
          maxRetries: 0,
          signal: options.signal,
        });
        reachedOfficialPage = true;
        const parsed = this.tenant.parser
          ? this.tenant.parser(response.body, response.url, config)
          : parseStatewideListingContent(response.body, config, response.url, 1);
        for (const row of parsed) {
          if (!rows.has(row.nativeId.toLowerCase())) rows.set(row.nativeId.toLowerCase(), row);
        }
        if (rows.size) break;
      } catch (error) {
        errors.push(`${this.tenant.portalId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const fallbackRecords = Array.from(rows.values())
      .map((row) => statewideToOpportunity(config, row))
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => statewideMatchesOptions(record, options))
      .slice(offset, offset + requestedLimit);
    if (fallbackRecords.length) {
      this.recordCount = fallbackRecords.length;
      this.lastError = undefined;
      this.lastSuccess = new Date();
      return { records: fallbackRecords, total: fallbackRecords.length, errors };
    }

    const primary = await this.tenant.primaryProvider.fetch(options);
    if (primary.records.length || !primary.errors.length) {
      this.recordCount = primary.records.length;
      this.lastError = undefined;
      this.lastSuccess = new Date();
      return primary;
    }

    if (reachedOfficialPage) {
      this.recordCount = 0;
      this.lastError = undefined;
      this.lastSuccess = new Date();
      return { records: [], total: 0, errors: [] };
    }

    const combined = [...errors, ...primary.errors];
    const reason = combined.join("; ") || `${this.tenant.portalId}: all official platform and availability routes failed`;
    this.recordCount = 0;
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

export const KANSAS_GBL2_TENANT: PeopleSoftPublicTenant = {
  portalId: "ks-esupplier",
  buyerName: "State of Kansas",
  state: "KS",
  listingUrl: "https://supplier.sok.ks.gov/psc/sokfsprdsup/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL2",
  alternateListingUrls: [
    "https://supplier.sok.ks.gov/psc/sokfsprdsup_1/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL2",
  ],
  sourceBadge: "Kansas eSupplier Public Bidding Events",
  maxPages: 6,
};

export const kansasGbl2Provider = new PeopleSoftPublicProvider(KANSAS_GBL2_TENANT);

export function availabilitySource(
  tenant: OfficialAvailabilityTenant,
): PublicPortalSource {
  return sourceFor(tenant);
}
