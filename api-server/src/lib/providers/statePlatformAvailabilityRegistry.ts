import type { DataSourceProvider } from "./types";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import type { StatewidePortalConfig } from "./statewideProcurementConfigs";
import type { StatewideListingRecord } from "./statewideProcurementParser";
import {
  OfficialAvailabilityProvider,
  availabilitySource,
} from "./statePlatformAvailabilityAdapters";
import { peopleSoftPublicProviders } from "./peopleSoftPublic";
import { periscopePublicProviders } from "./periscopePublic";
import { cgiAdvantageStateProviders } from "./cgiAdvantageStateAdapters";

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
  return decodeHtml(value.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<(?:br|hr)\b[^>]*>/gi, "\n").replace(/<\/(?:p|div|li|tr|td|th|section|article|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function labelValue(value: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:?\\s*([^\\n]+)`, "i"))?.[1]?.trim();
}

function parseDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value.replace(/\b(?:EST|EDT|CST|CDT|PST|PDT|ET|CT|PT)\b/gi, "").trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function westVirginiaParser(
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
    const solicitationNumber = labelValue(block, "Requisition Number");
    if (!solicitationNumber || !/\b(?:solicit|bid|proposal|project|contract)\b/i.test(`${title} ${block}`)) continue;
    records.push({
      nativeId: solicitationNumber,
      title,
      agency: config.buyerName,
      department: labelValue(block, "Division/Office"),
      status: "Open",
      postedDate: parseDate(labelValue(block, "Posted")),
      solicitationNumber,
      type: /\brfp\b|request for proposals?/i.test(title) ? "RFP" : "Bid",
      description: block.slice(0, 2_000),
      detailUrl: pageUrl,
      documentUrls: [],
      listingPage: 1,
    });
  }
  return records;
}

const wisconsinPrimary = peopleSoftPublicProviders["wi-vendornet"]!;
const oregonPrimary = periscopePublicProviders["or-oregonbuys"]!;
const westVirginiaPrimary = cgiAdvantageStateProviders["wv-oasis"]!;

const WISCONSIN_AVAILABILITY = {
  portalId: "wi-vendornet",
  buyerName: "State of Wisconsin",
  state: "WI",
  platform: "Wisconsin eSupplier / VendorNet",
  sourceBadge: "Wisconsin Public Solicitations",
  urls: [
    "https://vendornet.wi.gov/Bids.aspx",
    "https://doa.wi.gov/Pages/StateEmployees/Procurement.aspx",
  ],
  primaryProvider: wisconsinPrimary,
} as const;

const OREGON_AVAILABILITY = {
  portalId: "or-oregonbuys",
  buyerName: "State of Oregon",
  state: "OR",
  platform: "OregonBuys / Periscope S2G",
  sourceBadge: "OregonBuys Open Bids",
  urls: [
    "https://oregonbuys.gov/bso/view/search/external/advancedSearchBid.xhtml?currentDocType=bids&q=",
    "https://www.oregon.gov/das/ORBuys/Pages/Index.aspx",
  ],
  primaryProvider: oregonPrimary,
} as const;

const WEST_VIRGINIA_AVAILABILITY = {
  portalId: "wv-oasis",
  buyerName: "State of West Virginia",
  state: "WV",
  platform: "West Virginia wvOASIS / Official Bid Notices",
  sourceBadge: "West Virginia Public Bid Opportunities",
  urls: [
    "https://dep-auth.wv.gov/bto/IHP/Pages/default.aspx",
    "https://purchasing.wv.gov/vendor/Pages/default.aspx",
  ],
  primaryProvider: westVirginiaPrimary,
  parser: westVirginiaParser,
} as const;

/**
 * These availability wrappers intentionally augment an existing primary owner.
 * Kansas is not listed here: its canonical PeopleSoft provider owns ks-esupplier
 * directly, preventing the retired .GBL2 experiment from overriding it.
 */
export const stateAvailabilityProviders: Record<string, DataSourceProvider> = {
  "wi-vendornet": new OfficialAvailabilityProvider(WISCONSIN_AVAILABILITY),
  "or-oregonbuys": new OfficialAvailabilityProvider(OREGON_AVAILABILITY),
  "wv-oasis": new OfficialAvailabilityProvider(WEST_VIRGINIA_AVAILABILITY),
};

export const stateAvailabilitySources: PublicPortalSource[] = [
  availabilitySource(WISCONSIN_AVAILABILITY),
  availabilitySource(OREGON_AVAILABILITY),
  availabilitySource(WEST_VIRGINIA_AVAILABILITY),
];
