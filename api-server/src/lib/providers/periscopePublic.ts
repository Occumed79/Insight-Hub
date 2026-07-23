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
  statewideMatchesOptions,
  statewideToOpportunity,
  type StatewideListingRecord,
} from "./statewideProcurementParser";
import type { StatewidePortalConfig } from "./statewideProcurementConfigs";

export interface PeriscopePublicTenant {
  portalId: string;
  buyerName: string;
  state: string;
  rootUrl: string;
  sourceBadge: string;
}

interface JsfExportForm {
  actionUrl: string;
  fields: Map<string, string>;
  exportName: string;
  exportValue: string;
}

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

function hiddenFields(formHtml: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const match of formHtml.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const name = attribute(tag, "name");
    if (!name || (attribute(tag, "type") ?? "text").toLowerCase() !== "hidden") continue;
    fields.set(name, attribute(tag, "value") ?? "");
  }
  return fields;
}

export function parsePeriscopeCsvExportForm(
  html: string,
  pageUrl: string,
): JsfExportForm | undefined {
  const formMatch = html.match(/<form\b[^>]*id=["']bidSearchResultsForm["'][^>]*>[\s\S]*?<\/form>/i);
  if (!formMatch) return undefined;
  const formHtml = formMatch[0];
  const openTag = formHtml.match(/<form\b[^>]*>/i)?.[0] ?? "";
  const actionUrl = new URL(attribute(openTag, "action") || pageUrl, pageUrl).toString();
  const exportMatch = formHtml.match(
    /title=["']Export to CSV File["'][\s\S]{0,800}?mojarra\.jsfcljs\([^,]+,\s*\{["']([^"']+)["']\s*:\s*["']([^"']+)["']/i,
  );
  if (!exportMatch?.[1]) return undefined;
  return {
    actionUrl,
    fields: hiddenFields(formHtml),
    exportName: decodeHtml(exportMatch[1]),
    exportValue: decodeHtml(exportMatch[2] ?? exportMatch[1]),
  };
}

function listingUrl(tenant: PeriscopePublicTenant): string {
  return new URL("view/search/external/advancedSearchBid.xhtml?openBids=true", tenant.rootUrl).toString();
}

function asConfig(tenant: PeriscopePublicTenant): StatewidePortalConfig {
  const url = listingUrl(tenant);
  return {
    portalId: tenant.portalId,
    buyerName: tenant.buyerName,
    state: tenant.state,
    platform: "Periscope S2G / BSO",
    platformFamily: "periscope_bso",
    listingUrl: url,
    origin: new URL(url).origin,
    sourceBadge: tenant.sourceBadge,
    maxPages: 8,
  };
}

function sourceFor(tenant: PeriscopePublicTenant): PublicPortalSource {
  const url = listingUrl(tenant);
  return {
    id: tenant.portalId,
    agencyName: tenant.buyerName,
    agencyType: "state",
    state: tenant.state,
    sourceUrl: url,
    searchUrl: url,
    domain: new URL(url).hostname,
    portalPlatform: "Periscope S2G / BSO",
    sourceLevel: "state",
    level: "state",
    accessMode: "portal",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Shared stateful Periscope/BSO adapter using the public JSF listing and CSV export.",
  };
}

function formBody(form: JsfExportForm): string {
  const values = new URLSearchParams();
  for (const [name, value] of form.fields) values.set(name, value);
  values.set(form.exportName, form.exportValue);
  return values.toString();
}

function mergeRows(
  target: Map<string, StatewideListingRecord>,
  content: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  pageNumber: number,
): void {
  for (const row of parseStatewideListingContent(content, config, pageUrl, pageNumber)) {
    if (!target.has(row.nativeId.toLowerCase())) target.set(row.nativeId.toLowerCase(), row);
  }
}

export class PeriscopePublicProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private recordCount = 0;
  private lastError?: string;

  constructor(readonly tenant: PeriscopePublicTenant) {}

  async isConfigured(): Promise<boolean> {
    return Boolean(this.tenant.portalId && this.tenant.state.length === 2 && /^https:\/\//.test(this.tenant.rootUrl));
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const timeoutMs = positiveIntegerEnv("PERISCOPE_REQUEST_TIMEOUT_MS", 25_000, 3_000, 45_000);
    const maxRetries = positiveIntegerEnv("PERISCOPE_MAX_RETRIES", 1, 0, 2);
    const maxResults = positiveIntegerEnv("PERISCOPE_MAX_RESULTS", 250, 1, 500);
    const detailLimit = positiveIntegerEnv("PERISCOPE_DETAIL_LIMIT", 4, 0, 20);
    const offset = Math.max(options.offset ?? 0, 0);
    const requestedLimit = Math.min(Math.max(options.limit ?? maxResults, 1), maxResults);
    const targetCount = Math.min(maxResults, offset + requestedLimit);
    const config = asConfig(this.tenant);
    const session = new OfficialPlatformSession([config.origin], `${this.tenant.portalId} Periscope`);
    const errors: string[] = [];
    const rows = new Map<string, StatewideListingRecord>();

    let listing;
    try {
      listing = await session.requestText(config.listingUrl, {
        timeoutMs,
        maxRetries,
        signal: options.signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.lastError = reason;
      this.recordCount = 0;
      return { records: [], total: 0, errors: [`${this.tenant.portalId}: ${reason}`] };
    }

    mergeRows(rows, listing.body, config, listing.url, 1);

    const exportForm = parsePeriscopeCsvExportForm(listing.body, listing.url);
    if (exportForm) {
      try {
        const exported = await session.requestText(exportForm.actionUrl, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            origin: new URL(exportForm.actionUrl).origin,
            referer: listing.url,
          },
          body: formBody(exportForm),
          timeoutMs,
          maxRetries,
          signal: options.signal,
        });
        mergeRows(rows, exported.body, config, listing.url, 1);
      } catch (error) {
        errors.push(`${this.tenant.portalId}: public CSV export failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      errors.push(`${this.tenant.portalId}: public listing did not expose its JSF CSV export action`);
    }

    if (!rows.size) {
      const reason = errors.join("; ")
        || `${this.tenant.portalId}: Periscope public listing returned no recognizable active bid rows`;
      this.lastError = reason;
      this.recordCount = 0;
      return { records: [], total: 0, errors: [reason] };
    }

    const selected = Array.from(rows.values()).slice(0, targetCount);
    const enriched: NormalizedOpportunity[] = [];
    for (const [index, row] of selected.entries()) {
      let detail;
      if (index < detailLimit && row.detailUrl !== listing.url && new URL(row.detailUrl).origin === config.origin) {
        try {
          const detailPage = await session.requestText(row.detailUrl, {
            timeoutMs,
            maxRetries,
            signal: options.signal,
          });
          detail = parseStatewideDetailHtml(detailPage.body, config, detailPage.url);
        } catch (error) {
          errors.push(`${this.tenant.portalId}:${row.nativeId}: detail enrichment failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const normalized = statewideToOpportunity(config, row, detail);
      if (normalized && statewideMatchesOptions(normalized, options)) enriched.push(normalized);
    }

    const records = enriched.slice(offset, offset + requestedLimit);
    this.recordCount = records.length;
    this.lastError = records.length ? undefined : errors.join("; ") || undefined;
    if (records.length) this.lastSuccess = new Date();
    return { records, total: records.length, errors };
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

export const PERISCOPE_TENANTS: readonly PeriscopePublicTenant[] = [
  {
    portalId: "il-bidbuy",
    buyerName: "State of Illinois",
    state: "IL",
    rootUrl: "https://www.bidbuy.illinois.gov/bso/",
    sourceBadge: "Illinois BidBuy Open Bids",
  },
  {
    portalId: "or-oregonbuys",
    buyerName: "State of Oregon",
    state: "OR",
    rootUrl: "https://oregonbuys.gov/bso/",
    sourceBadge: "OregonBuys Open Bids",
  },
] as const;

export const PERISCOPE_SOURCES: PublicPortalSource[] = PERISCOPE_TENANTS.map(sourceFor);
export const periscopePublicProviders: Record<string, DataSourceProvider> = Object.fromEntries(
  PERISCOPE_TENANTS.map((tenant) => [tenant.portalId, new PeriscopePublicProvider(tenant)]),
);
