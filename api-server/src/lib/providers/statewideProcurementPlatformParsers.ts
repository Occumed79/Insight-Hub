import { parseJaggaerPublicEventHtml } from "./jaggaerSciQuest";
import type { StatewidePortalConfig } from "./statewideProcurementConfigs";
import {
  statewideStableHash,
  type StatewideListingRecord,
} from "./statewideProcurementParser";

export function parseStatewidePlatformListings(
  content: string,
  config: StatewidePortalConfig,
  pageUrl: string,
  listingPage: number,
): StatewideListingRecord[] {
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
