import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { fetchOfficialPortalText, positiveIntegerEnv } from "./officialPortalHttp";

const UNKNOWN_POSTED_DATE = new Date(0);
const DEFAULT_LIMIT = 100;

interface BsoPortalConfig {
  sourceId: string;
  portalName: string;
  state: string;
  origin: string;
  listingUrl: string;
}

interface BsoListingRow {
  bidNumber: string;
  organization: string;
  buyer?: string;
  description: string;
  bidOpeningDate?: string;
  status?: string;
  alternateId?: string;
  sourceUrl: string;
  listingPageUrl: string;
}

interface BsoDetail {
  bidNumber?: string;
  description?: string;
  bidOpeningDate?: string;
  purchaser?: string;
  organization?: string;
  department?: string;
  location?: string;
  alternateId?: string;
  requiredDate?: string;
  availableDate?: string;
  infoContact?: string;
  bidType?: string;
  purchaseMethod?: string;
  beginDate?: string;
  endDate?: string;
  preBidConference?: string;
  bulletinDescription?: string;
  attachmentNames: string[];
  commodityCodes: string[];
}

const DETAIL_LABELS = [
  "Bid Number",
  "Description",
  "Bid Opening Date",
  "Purchaser",
  "Organization",
  "Department",
  "Location",
  "Fiscal Year",
  "Type Code",
  "Allow Electronic Quote",
  "Alternate Id",
  "Required Date",
  "Available Date",
  "Info Contact",
  "Bid Type",
  "Informal Bid Flag",
  "Purchase Method",
  "Begin Date",
  "End Date",
  "Pre Bid Conference",
  "Bulletin Desc",
  "Ship-to Address",
  "Bill-to Address",
  "Print Format",
  "File Attachments",
  "Form Attachments",
  "Required Quote Attachments",
  "Item Information",
] as const;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}

function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|tr|td|th|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCell(value: string): string {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function parseDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value
    .replace(/\s+(?:ET|EST|EDT|PT|PST|PDT|CT|CST|CDT|MT|MST|MDT)$/i, "")
    .trim();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function sameOriginAbsolute(
  href: string,
  pageUrl: string,
  expectedOrigin: string,
): string | undefined {
  try {
    const url = new URL(decodeHtml(href), pageUrl);
    if (url.origin !== expectedOrigin) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function looksLikeDate(value: string): boolean {
  return (
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(value) &&
    /(?:\d{1,2}:\d{2}|\bAM\b|\bPM\b)/i.test(value)
  );
}

function parseListingRows(html: string, config: BsoPortalConfig): BsoListingRow[] {
  const rows: BsoListingRow[] = [];
  const seen = new Set<string>();

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1] ?? "";
    const detailAnchor = rowHtml.match(
      /<a\b[^>]*href=["']([^"']*\/external\/bidDetail\.sda\?[^"']*docId=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!detailAnchor) continue;

    const bidNumber = normalizeCell(detailAnchor[2] ?? "");
    if (!bidNumber || seen.has(bidNumber.toLowerCase())) continue;

    const sourceUrl = sameOriginAbsolute(
      detailAnchor[1] ?? "",
      config.listingUrl,
      config.origin,
    );
    if (!sourceUrl) continue;

    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi))
      .map((match) => normalizeCell(match[1] ?? ""))
      .filter(Boolean);
    const bidIndex = cells.findIndex(
      (cell) => cell === bidNumber || cell.includes(bidNumber),
    );
    const trailing = bidIndex >= 0 ? cells.slice(bidIndex + 1) : cells;
    const distinct = trailing.filter(
      (cell, index) => cell !== bidNumber && trailing.indexOf(cell) === index,
    );
    const dateIndex = distinct.findIndex(looksLikeDate);
    if (dateIndex < 1) continue;

    const beforeDate = distinct.slice(0, dateIndex);
    const afterDate = distinct.slice(dateIndex + 1);
    const organization = beforeDate[0] ?? config.portalName;
    const description = beforeDate[beforeDate.length - 1] ?? bidNumber;
    const buyer = beforeDate.length >= 3 ? beforeDate[beforeDate.length - 2] : undefined;
    const statusIndex = afterDate.findIndex((value) =>
      /^(?:sent|open|ready|released|posted)$/i.test(value),
    );
    const status = statusIndex >= 0 ? afterDate[statusIndex] : undefined;
    const alternateId = statusIndex >= 0 ? afterDate[statusIndex + 1] : undefined;

    seen.add(bidNumber.toLowerCase());
    rows.push({
      bidNumber,
      organization,
      buyer,
      description,
      bidOpeningDate: distinct[dateIndex],
      status,
      alternateId,
      sourceUrl,
      listingPageUrl: config.listingUrl,
    });
  }

  return rows;
}

function detailValue(text: string, label: string): string | undefined {
  const otherLabels = DETAIL_LABELS
    .filter((candidate) => candidate !== label)
    .map(escapeRegex)
    .join("|");
  const pattern = new RegExp(
    `${escapeRegex(label)}\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:${otherLabels})\\s*:|$)`,
    "i",
  );
  const value = text.match(pattern)?.[1]?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

function parseAttachments(html: string): string[] {
  const attachments = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = normalizeCell(match[1] ?? "");
    if (/\.(?:pdf|docx?|xlsx?|csv|zip)(?:\s|$)/i.test(name)) {
      attachments.add(name.slice(0, 240));
    }
  }
  if (attachments.size === 0) {
    for (const line of stripTags(html).split("\n")) {
      const name = line.trim();
      if (/\.(?:pdf|docx?|xlsx?|csv|zip)(?:\s|$)/i.test(name)) {
        attachments.add(name.slice(0, 240));
      }
    }
  }
  return Array.from(attachments).slice(0, 50);
}

function parseCommodityCodes(text: string): string[] {
  const codes = new Set<string>();
  for (const match of text.matchAll(
    /(?:NIGP|U\s*N\s*S\s*P\s*S\s*C)\s*Code\s*:\s*([0-9][0-9\s-]{2,20})/gi,
  )) {
    const code = (match[1] ?? "")
      .replace(/\s+/g, "")
      .replace(/-+$/, "");
    if (code) codes.add(code);
  }
  return Array.from(codes).slice(0, 25);
}

function parseDetail(html: string): BsoDetail {
  const text = stripTags(html);
  return {
    bidNumber: detailValue(text, "Bid Number"),
    description: detailValue(text, "Description"),
    bidOpeningDate: detailValue(text, "Bid Opening Date"),
    purchaser: detailValue(text, "Purchaser"),
    organization: detailValue(text, "Organization"),
    department: detailValue(text, "Department"),
    location: detailValue(text, "Location"),
    alternateId: detailValue(text, "Alternate Id"),
    requiredDate: detailValue(text, "Required Date"),
    availableDate: detailValue(text, "Available Date"),
    infoContact: detailValue(text, "Info Contact"),
    bidType: detailValue(text, "Bid Type"),
    purchaseMethod: detailValue(text, "Purchase Method"),
    beginDate: detailValue(text, "Begin Date"),
    endDate: detailValue(text, "End Date"),
    preBidConference: detailValue(text, "Pre Bid Conference"),
    bulletinDescription: detailValue(text, "Bulletin Desc"),
    attachmentNames: parseAttachments(html),
    commodityCodes: parseCommodityCodes(text),
  };
}

function rowToOpportunity(
  row: BsoListingRow,
  detail: BsoDetail | undefined,
  config: BsoPortalConfig,
): NormalizedOpportunity | null {
  const bidNumber = detail?.bidNumber ?? row.bidNumber;
  const responseDeadline = parseDate(detail?.bidOpeningDate ?? row.bidOpeningDate);
  if (responseDeadline && responseDeadline < new Date()) return null;

  const parsedPostedDate = parseDate(detail?.availableDate);
  const postedDate = parsedPostedDate ?? UNKNOWN_POSTED_DATE;
  const organization = detail?.organization ?? row.organization ?? config.portalName;
  const title = detail?.description ?? row.description ?? bidNumber;
  const purchaser = detail?.purchaser ?? row.buyer;
  const description = [
    detail?.bulletinDescription,
    title,
    detail?.department ? `Department: ${detail.department}` : null,
    detail?.location ? `Location: ${detail.location}` : null,
    purchaser ? `Purchaser: ${purchaser}` : null,
    detail?.infoContact ? `Info Contact: ${detail.infoContact}` : null,
    detail?.purchaseMethod ? `Purchase Method: ${detail.purchaseMethod}` : null,
    detail?.preBidConference
      ? `Pre-Bid Conference: ${detail.preBidConference}`
      : null,
    detail?.beginDate || detail?.endDate
      ? `Contract Period: ${detail?.beginDate ?? "unknown"} through ${detail?.endDate ?? "unknown"}`
      : null,
    detail?.attachmentNames.length
      ? `Public Attachments: ${detail.attachmentNames.join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    externalId: `bso-${config.sourceId}-${bidNumber}`,
    title,
    agency: organization,
    subAgency: detail?.department,
    type: "Bid Solicitation",
    status: "active",
    postedDate,
    responseDeadline,
    solicitationNumber: bidNumber,
    sourceUrl: row.sourceUrl,
    description,
    source: "publicPortalProviders",
    providerName: "publicPortalProviders",
    rawData: {
      providerName: "periscope_s2g_bso_direct_adapter",
      providerFamily: "periscope_s2g_bso",
      discoveryMethod: "direct_official_listing",
      sourceId: config.sourceId,
      portalName: config.portalName,
      portalState: config.state,
      sourceConfidence: "high",
      dateUnknown: !parsedPostedDate,
      listingPageUrl: row.listingPageUrl,
      listingPageNumber: 1,
      paginationMode: "public_first_page",
      detailFetched: Boolean(detail),
      listingStatus: row.status,
      bidType: detail?.bidType,
      alternateId: detail?.alternateId ?? row.alternateId,
      buyer: purchaser,
      requiredDate: detail?.requiredDate,
      availableDate: detail?.availableDate,
      beginDate: detail?.beginDate,
      endDate: detail?.endDate,
      attachmentNames: detail?.attachmentNames ?? [],
      commodityCodes: detail?.commodityCodes ?? [],
      tags: [
        "direct-official-portal",
        "platform:periscope-s2g-bso",
        `state:${config.state}`,
        `source:${config.sourceId}`,
        ...(!parsedPostedDate ? ["date-unknown"] : []),
        ...(detail ? ["detail-enriched"] : []),
      ],
      notes: detail
        ? `Parsed from the public ${config.portalName} open-bid listing and enriched from its public BSO detail page.`
        : `Parsed from the public ${config.portalName} open-bid listing.`,
      listing: row,
      detail,
    },
  };
}

class BsoPortalProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  constructor(private readonly config: BsoPortalConfig) {}

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 250);
    const timeoutMs = positiveIntegerEnv(
      "BSO_REQUEST_TIMEOUT_MS",
      20_000,
      3_000,
      60_000,
    );
    const maxRetries = positiveIntegerEnv("BSO_MAX_RETRIES", 2, 0, 5);
    const detailLimit = positiveIntegerEnv("BSO_DETAIL_LIMIT", 10, 0, 100);
    const errors: string[] = [];

    let listingHtml: string;
    try {
      listingHtml = await fetchOfficialPortalText(this.config.listingUrl, {
        label: `${this.config.portalName} open bids`,
        origin: this.config.origin,
        timeoutMs,
        maxRetries,
        signal: options.signal,
      });
    } catch (error) {
      return {
        records: [],
        total: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }

    const rows = parseListingRows(listingHtml, this.config).slice(0, limit);
    if (rows.length === 0) {
      errors.push(
        `${this.config.portalName}: the public open-bid page returned no recognizable BSO bid rows.`,
      );
    }

    const records: NormalizedOpportunity[] = [];
    for (const [index, row] of rows.entries()) {
      let detail: BsoDetail | undefined;
      if (index < detailLimit) {
        try {
          const detailHtml = await fetchOfficialPortalText(row.sourceUrl, {
            label: `${this.config.portalName} bid ${row.bidNumber}`,
            origin: this.config.origin,
            timeoutMs,
            maxRetries,
            signal: options.signal,
          });
          detail = parseDetail(detailHtml);
        } catch (error) {
          errors.push(
            `${this.config.portalName} bid ${row.bidNumber}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      const record = rowToOpportunity(row, detail, this.config);
      if (record) records.push(record);
    }

    if (rows.length >= 25) {
      errors.push(
        `${this.config.portalName}: collection currently covers the public first result page; JSF postback pagination is not yet automated.`,
      );
    }

    return { records, total: records.length, errors };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: true,
      healthy: true,
    };
  }
}

function bsoConfig(
  sourceId: string,
  portalName: string,
  state: string,
  rootUrl: string,
): BsoPortalConfig {
  const root = new URL(rootUrl);
  return {
    sourceId,
    portalName,
    state,
    origin: root.origin,
    listingUrl: new URL(
      "view/search/external/advancedSearchBid.xhtml?openBids=true",
      root,
    ).toString(),
  };
}

export const bsoPortalProviders: Record<string, DataSourceProvider> = {
  "ma-commbuys": new BsoPortalProvider(
    bsoConfig(
      "ma-commbuys",
      "Massachusetts COMMBUYS",
      "MA",
      "https://www.commbuys.com/bso/",
    ),
  ),
  "nv-epro": new BsoPortalProvider(
    bsoConfig(
      "nv-epro",
      "NevadaEPro",
      "NV",
      "https://nevadaepro.com/bso/",
    ),
  ),
  "nj-start": new BsoPortalProvider(
    bsoConfig(
      "nj-start",
      "New Jersey START",
      "NJ",
      "https://www.njstart.gov/bso/",
    ),
  ),
};
