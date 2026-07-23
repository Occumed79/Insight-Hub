import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { OfficialPlatformSession } from "./officialPlatformSession";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import type { StatewidePortalConfig } from "./statewideProcurementConfigs";
import {
  statewideHtmlToText,
  statewideMatchesOptions,
  statewideStableHash,
  statewideToOpportunity,
  type StatewideListingRecord,
} from "./statewideProcurementParser";

const LISTING_URL =
  "https://www.vermontbusinessregistry.com/BidSearch.aspx?type=5";
const ALTERNATE_URL =
  "https://www.vermontbusinessregistry.com/BidSearch.aspx?type=1";

const CONFIG: StatewidePortalConfig = {
  portalId: "vt-bids",
  buyerName: "State of Vermont",
  state: "VT",
  platform: "Vermont Business Registry Open Bids",
  platformFamily: "state_html",
  listingUrl: LISTING_URL,
  alternateListingUrls: [ALTERNATE_URL],
  origin: new URL(LISTING_URL).origin,
  sourceBadge: "Vermont Open State Bids",
  requestTimeoutMs: 12_000,
  maxRetries: 0,
  maxPages: 2,
};

function parseDate(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function inferType(title: string): string {
  if (/\brfp\b|request for proposals?/i.test(title)) return "RFP";
  if (/\brfq\b|request for qualifications?|request for quotations?/i.test(title)) {
    return "RFQ";
  }
  if (/\brfi\b|request for information/i.test(title)) return "RFI";
  if (/\b(?:ifb|itb)\b|invitation (?:for|to) bids?/i.test(title)) return "Bid";
  return "Solicitation";
}

function exactDate(value: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value.trim());
}

function noise(value: string): boolean {
  return (
    value.length < 2
    || exactDate(value)
    || /^(?:view|details?|more|print|image|open|close|search|next|previous|back|home)$/i.test(value)
    || /search results|sort results|list open bids|bid quick search|bid power search/i.test(value)
  );
}

function priorContentLine(lines: readonly string[], start: number): number {
  for (let index = start; index >= Math.max(0, start - 14); index -= 1) {
    const value = lines[index] ?? "";
    if (!noise(value) && !/\bClose Date\s*:/i.test(value)) return index;
  }
  return -1;
}

function splitCombinedTitleAgency(value: string): {
  title?: string;
  agency?: string;
} {
  const marker = value.search(
    /\b(?:Buildings\s*&\s*General\s+Svs|Department\b|Dept\.|Agency\b|State of Vermont|Town of\b|City of\b|Village of\b|DEC\b|Fish\s*&\s*Wildlife|Military Department|Regional Planning Commission|Natural Resources Conservation District|Unified School District)\b/i,
  );
  if (marker <= 5) return {};
  return {
    title: value.slice(0, marker).trim(),
    agency: value.slice(marker).trim(),
  };
}

export function parseVermontOpenBidRows(
  html: string,
  pageUrl = LISTING_URL,
): StatewideListingRecord[] {
  const expanded = html
    .replace(/<img\b[^>]*>/gi, "\n")
    .replace(/<\/(?:span|a|font|strong|b|em|label)>/gi, "$&\n");
  const lines = statewideHtmlToText(expanded)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rows: StatewideListingRecord[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const closeAt = line.search(/\bClose Date\s*:/i);
    if (closeAt < 0) continue;

    const deadlineText = line
      .slice(closeAt)
      .replace(/^Close Date\s*:\s*/i, "")
      .trim();
    let agency = line.slice(0, closeAt).trim();
    let titleIndex = priorContentLine(lines, index - 1);
    let title = titleIndex >= 0 ? (lines[titleIndex] ?? "").trim() : "";

    if (!agency) {
      const agencyIndex = priorContentLine(lines, index - 1);
      if (agencyIndex >= 0) {
        agency = (lines[agencyIndex] ?? "").trim();
        titleIndex = priorContentLine(lines, agencyIndex - 1);
        title = titleIndex >= 0 ? (lines[titleIndex] ?? "").trim() : "";
      }
    }

    const combined = splitCombinedTitleAgency(agency);
    if (combined.title && combined.agency) {
      title = combined.title;
      agency = combined.agency;
    } else if (title === agency || noise(title)) {
      const previous = priorContentLine(lines, titleIndex - 1);
      title = previous >= 0 ? (lines[previous] ?? "").trim() : title;
    }

    if (
      title.length < 6
      || agency.length < 2
      || noise(title)
      || !deadlineText
    ) {
      continue;
    }

    let postedDate: Date | undefined;
    for (let prior = Math.max(0, titleIndex - 1); prior >= Math.max(0, titleIndex - 18); prior -= 1) {
      const value = lines[prior] ?? "";
      if (exactDate(value)) {
        postedDate = parseDate(value);
        break;
      }
    }

    const responseDeadline = parseDate(deadlineText);
    const solicitationNumber =
      title.match(/\bRFP\/RFQ\s*:\s*(.+)$/i)?.[1]?.trim()
      || title.match(/\b(?:RFP|RFQ|RFI|IFB|ITB)\s*[#:]?\s*([A-Z0-9][A-Z0-9._/-]{2,})\b/i)?.[1]?.trim();
    const nativeId =
      solicitationNumber
      || statewideStableHash(`${title}|${agency}|${deadlineText}`);
    const key = nativeId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      nativeId,
      title,
      agency,
      status: "Open",
      postedDate,
      responseDeadline,
      solicitationNumber: solicitationNumber || nativeId,
      type: inferType(title),
      description: `${title}\n${agency}\nClose Date: ${deadlineText}`,
      detailUrl: pageUrl,
      documentUrls: [],
      listingPage: 1,
    });
  }

  return rows;
}

export const VERMONT_BID_RECOVERY_SOURCE: PublicPortalSource = {
  id: "vt-bids",
  agencyName: "State of Vermont",
  agencyType: "state",
  state: "VT",
  sourceUrl: LISTING_URL,
  searchUrl: LISTING_URL,
  domain: new URL(LISTING_URL).hostname,
  portalPlatform: "Vermont Business Registry Open Bids",
  sourceLevel: "state",
  level: "state",
  accessMode: "public_html",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes:
    "Dedicated listing-only parser for the Vermont Business Registry legacy open-bid results layout.",
};

class VermontBidRecoveryProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;
  private lastAttempt?: Date;
  private lastSuccess?: Date;
  private lastError?: string;
  private recordCount = 0;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    this.lastAttempt = new Date();
    const session = new OfficialPlatformSession(
      [CONFIG.origin],
      "vt-bids Vermont Business Registry",
    );
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const rows = new Map<string, StatewideListingRecord>();
    const errors: string[] = [];

    for (const url of [LISTING_URL, ALTERNATE_URL]) {
      if (rows.size >= offset + limit) break;
      try {
        const response = await session.requestText(url, {
          timeoutMs: 12_000,
          maxRetries: 0,
          signal: options.signal,
          redirectLimit: 3,
        });
        for (const row of parseVermontOpenBidRows(response.body, response.url)) {
          rows.set(row.nativeId.toLowerCase(), row);
        }
      } catch (error) {
        errors.push(
          `vt-bids: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const records = Array.from(rows.values())
      .map((row) => statewideToOpportunity(CONFIG, row))
      .filter((record): record is NormalizedOpportunity => Boolean(record))
      .filter((record) => statewideMatchesOptions(record, options))
      .slice(offset, offset + limit);

    this.recordCount = records.length;
    if (records.length) {
      this.lastSuccess = new Date();
      this.lastError = undefined;
      return { records, total: records.length, errors };
    }

    const reason =
      errors.join("; ")
      || "vt-bids: Vermont open-bid page returned no recognizable active bid rows";
    this.lastError = reason;
    return { records: [], total: 0, errors: [reason] };
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

export const vermontBidRecoveryProvider = new VermontBidRecoveryProvider();
