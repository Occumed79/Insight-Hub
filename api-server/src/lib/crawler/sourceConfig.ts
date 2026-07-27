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

/**
 * Deliberately empty until a source-specific fixture/live review proves that a
 * generic extractor is safe and useful. Adding an ID here is an explicit code
 * review decision; catalog fields never self-authorize execution.
 */
export const VETTED_PUBLIC_PORTAL_EXTRACTOR_IDS = new Set<string>();

const APPROVED_DISCOVERY_NOTE_PREFIX =
  "Approved from browser discovery candidate";

export function isApprovedPublicPortalSpiderConfig(
  config: SpiderConfig | undefined,
): boolean {
  if (!config?.enabled) return false;
  return (
    VETTED_PUBLIC_PORTAL_EXTRACTOR_IDS.has(config.sourceId) ||
    config.notes?.startsWith(APPROVED_DISCOVERY_NOTE_PREFIX) === true
  );
}

export function hasApprovedPublicPortalSpiderConfig(
  sourceId: string,
): boolean {
  return isApprovedPublicPortalSpiderConfig(
    getSpiderConfig(`public-portal:${sourceId}`),
  );
}

function familyName(source: PublicPortalSource, fallback: string): string {
  return source.portalPlatform?.trim() || fallback;
}

export function defaultSpiderConfigForSource(
  source: PublicPortalSource,
): SpiderConfig | undefined {
  if (!VETTED_PUBLIC_PORTAL_EXTRACTOR_IDS.has(source.id)) return undefined;

  const id = `public-portal:${source.id}`;
  const startUrl = source.searchUrl ?? source.sourceUrl;
  const base = {
    id,
    sourceId: source.id,
    enabled: true,
    startUrls: [startUrl],
    allowedHosts: [source.domain],
    scheduleMinutes: 60,
    limits: {
      maxPages: 5,
      maxUrls: 100,
      elapsedMs: 30_000,
    },
    notes: `Explicitly vetted public portal extractor; catalog scraperType=${source.scraperType}`,
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
  if (existing) return isApprovedPublicPortalSpiderConfig(existing)
    ? existing
    : undefined;
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
