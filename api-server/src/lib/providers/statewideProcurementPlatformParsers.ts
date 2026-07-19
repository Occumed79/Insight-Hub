import { parseJaggaerPublicEventHtml } from "./jaggaerSciQuest";
import {
  allowedStatewideUrl,
  type StatewidePortalConfig,
} from "./statewideProcurementConfigs";
import {
  statewideStableHash,
  type StatewideListingRecord,
} from "./statewideProcurementParser";

interface DelawareOpenBid {
  contractnumber?: string;
  contracttitle?: string;
  opendate?: string;
  deadlinedate?: string;
  agencycode?: string;
  unspsc?: string;
  bidurl?: string | { url?: string };
}

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value?.trim()) return undefined;
  const cleaned = value.trim();
  const dateOnly = /^\d{4}-\d{1,2}-\d{1,2}(?:T00:00:00(?:\.000)?)?$/.test(cleaned);
  const parsed = new Date(endOfDay && dateOnly ? `${cleaned.slice(0, 10)}T23:59:59.999` : cleaned);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function delawareBidUrl(value: DelawareOpenBid["bidurl"]): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return value?.url?.trim() || undefined;
}

function parseDelawareOpenBids(
  content: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord[] {
  let rows: DelawareOpenBid[];
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) return [];
    rows = parsed.filter((value): value is DelawareOpenBid => Boolean(value && typeof value === "object"));
  } catch {
    return [];
  }

  return rows.flatMap((row) => {
    const title = row.contracttitle?.trim();
    const nativeId = row.contractnumber?.trim();
    if (!title || !nativeId) return [];
    const deadline = parseDate(row.deadlinedate, true);
    if (deadline && deadline.getTime() < Date.now()) return [];
    const bidUrl = delawareBidUrl(row.bidurl);
    const detailUrl = bidUrl
      ? allowedStatewideUrl(config, bidUrl, pageUrl) || pageUrl
      : pageUrl;
    return [{
      nativeId,
      title,
      agency: row.agencycode?.trim() || config.buyerName,
      status: "Open",
      postedDate: parseDate(row.opendate),
      responseDeadline: deadline,
      solicitationNumber: nativeId,
      type: /\brfp\b|request for proposals?/i.test(title) ? "RFP" : /\brfq\b/i.test(title) ? "RFQ" : "Solicitation",
      description: row.unspsc?.trim() ? `UNSPSC: ${row.unspsc.trim()}` : undefined,
      detailUrl,
      documentUrls: [],
      listingPage,
    }];
  });
}

export function parseStatewidePlatformListings(
  content: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord[] {
  if (config.portalId === "de-mymarketplace") {
    return parseDelawareOpenBids(content, config, pageUrl, listingPage);
  }

  if (config.platformFamily !== "jaggaer_sciquest") return [];

  return parseJaggaerPublicEventHtml(content, pageUrl).map((event) => {
    const nativeId = event.solicitationNumber?.trim()
      || statewideStableHash(`${config.portalId}|${event.title}|${event.responseDeadline?.toISOString() ?? ""}`);
    return {
      nativeId,
      title: event.title,
      agency: config.buyerName,
      postedDate: event.postedDate,
      responseDeadline: event.responseDeadline,
      solicitationNumber: event.solicitationNumber || nativeId,
      type: event.type,
      description: event.description,
      detailUrl: pageUrl,
      documentUrls: [],
      listingPage,
    };
  });
}
