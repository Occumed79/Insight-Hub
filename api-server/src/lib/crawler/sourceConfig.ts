import type { PublicPortalSource } from "../providers/publicPortalProviders/catalog";
import {
  DOCUMENT_INDEX_FAMILY_TEMPLATE_ID,
  FEED_FAMILY_TEMPLATE_ID,
  STATIC_LISTING_FAMILY_TEMPLATE_ID,
} from "./familyTemplates";
import {
  runRegisteredSpider,
  type RunRegisteredSpiderOptions,
} from "./orchestrator";
import { getSpiderConfig, registerSpiderConfig } from "./registry";
import type { SpiderConfig, SpiderRunResult } from "./types";

function familyName(source: PublicPortalSource, fallback: string): string {
  return source.portalPlatform?.trim() || fallback;
}

export function defaultSpiderConfigForSource(
  source: PublicPortalSource,
): SpiderConfig | undefined {
  const id = `public-portal:${source.id}`;
  const startUrl = source.searchUrl ?? source.sourceUrl;
  const base = {
    id,
    sourceId: source.id,
    enabled: source.enabled && source.verificationStatus === "verified",
    startUrls: [startUrl],
    allowedHosts: [source.domain],
    scheduleMinutes: 60,
    limits: {
      maxPages: 5,
      maxUrls: 100,
      elapsedMs: 30_000,
    },
    notes: `Generated from public portal catalog scraperType=${source.scraperType}`,
  };

  if (source.scraperType === "static_html" || source.scraperType === "scrapy") {
    return {
      ...base,
      kind: "portal_family",
      family: familyName(source, "bounded-static-listing"),
      delegateSpiderId: STATIC_LISTING_FAMILY_TEMPLATE_ID,
    };
  }
  if (source.scraperType === "pdf_links") {
    return {
      ...base,
      kind: "portal_family",
      family: familyName(source, "official-document-index"),
      delegateSpiderId: DOCUMENT_INDEX_FAMILY_TEMPLATE_ID,
      scheduleMinutes: 120,
    };
  }
  if (source.scraperType === "rss") {
    return {
      ...base,
      kind: "portal_family",
      family: familyName(source, "rss-atom-feed"),
      delegateSpiderId: FEED_FAMILY_TEMPLATE_ID,
    };
  }
  if (source.scraperType === "playwright_public") {
    return {
      ...base,
      kind: "browser_discovery",
      activateOpportunityTab: true,
      paginateOnce: true,
      maxResponses: 10,
      scheduleMinutes: 24 * 60,
    };
  }
  if (source.scraperType === "public_json") {
    return {
      ...base,
      kind: "json_endpoint",
      endpointUrl: startUrl,
      method: "GET",
      pagination: {
        mode: "page",
        parameter: "page",
        pageSizeParameter: "limit",
        pageSize: 100,
      },
      fields: {
        id: ["id", "noticeId", "solicitationId", "bidId", "number"],
        title: ["title", "name", "subject", "description"],
        agency: [
          "agency",
          "agencyName",
          "department",
          "buyerName",
          "organization",
        ],
        description: ["description", "summary", "details", "scope"],
        solicitationNumber: [
          "solicitationNumber",
          "solicitation",
          "bidNumber",
          "referenceNumber",
          "number",
        ],
        postedDate: [
          "postedDate",
          "publishDate",
          "publishedAt",
          "createdDate",
          "datePosted",
        ],
        responseDeadline: [
          "responseDeadline",
          "closingDate",
          "closeDate",
          "dueDate",
          "deadline",
        ],
        status: ["status", "state"],
        detailUrl: ["detailUrl", "url", "link", "href"],
        location: ["location", "placeOfPerformance", "state"],
        type: ["type", "noticeType", "solicitationType"],
      },
    };
  }
  return undefined;
}

export function ensureSourceSpiderConfig(
  source: PublicPortalSource,
): SpiderConfig | undefined {
  const id = `public-portal:${source.id}`;
  const existing = getSpiderConfig(id);
  if (existing) return existing;
  const generated = defaultSpiderConfigForSource(source);
  if (generated) registerSpiderConfig(generated);
  return generated;
}

export async function runCrawlerForSource(
  source: PublicPortalSource,
  options: RunRegisteredSpiderOptions = {},
): Promise<SpiderRunResult | undefined> {
  const config = ensureSourceSpiderConfig(source);
  if (!config) return undefined;
  return runRegisteredSpider(source, config.id, options);
}
