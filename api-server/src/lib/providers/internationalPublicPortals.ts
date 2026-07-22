import { createHash } from "crypto";

import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { serperProvider, type SerperSearchResult } from "./serper";
import { extractMetadataFromText } from "../search/heuristicExtract";
import { classifyResult } from "../search/relevance";
import {
  ENRICHED_DIRECT_RFP_PORTALS,
  type EnrichedDirectRfpPortal,
} from "./directRfpPortalRelevanceCatalog";
import { INTERNATIONAL_PORTAL_GROUPS } from "./portalDirectory";

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_LIMIT = 75;
const MAX_DOMAINS_PER_QUERY = 5;
const UNKNOWN_POSTED_DATE = new Date(0);
const PROCUREMENT_EXPRESSION =
  "(RFP OR RFQ OR tender OR bid OR solicitation OR procurement)";
const SERVICE_EXPRESSION =
  '("occupational health" OR "occupational medicine" OR "employee health" OR "medical surveillance" OR "fitness for duty" OR "pre-employment physical" OR "drug testing" OR "alcohol testing" OR audiometric OR spirometry OR "respirator fit testing")';

const INTERNATIONAL_PORTAL_IDS = new Set<string>(
  INTERNATIONAL_PORTAL_GROUPS.flatMap((group) => [...group.portalIds]),
);
const INTERNATIONAL_PORTALS = ENRICHED_DIRECT_RFP_PORTALS.filter((portal) =>
  INTERNATIONAL_PORTAL_IDS.has(portal.id),
);

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function portalForUrl(url: string): EnrichedDirectRfpPortal | undefined {
  try {
    const host = normalizedHost(new URL(url).hostname);
    return INTERNATIONAL_PORTALS.find((portal) => {
      const domain = normalizedHost(portal.domain);
      return (
        host === domain ||
        host.endsWith(`.${domain}`) ||
        domain.endsWith(`.${host}`)
      );
    });
  } catch {
    return undefined;
  }
}

function groupForPortal(portalId: string): string | undefined {
  return INTERNATIONAL_PORTAL_GROUPS.find((group) =>
    group.portalIds.some((id) => id === portalId),
  )?.title;
}

function hasStaleYearOnly(text: string): boolean {
  const years = Array.from(text.matchAll(/\b20\d{2}\b/g)).map((match) =>
    Number(match[0]),
  );
  if (years.length === 0) return false;
  const hasCurrentOrFuture = years.some(
    (year) => year >= CURRENT_YEAR && year <= CURRENT_YEAR + 2,
  );
  return years.some((year) => year < CURRENT_YEAR) && !hasCurrentOrFuture;
}

function parsedDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizedResultKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${normalizedHost(parsed.hostname)}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function isUsefulResult(
  result: SerperSearchResult,
  portal: EnrichedDirectRfpPortal,
): boolean {
  const raw = `${result.title} ${result.snippet} ${result.link}`;
  if (hasStaleYearOnly(raw)) return false;
  const classification = classifyResult({
    title: result.title,
    snippet: result.snippet,
    url: result.link,
    allowHistorical: false,
  });
  if (classification.rejected) return false;
  if (!/\b(rfp|rfq|tender|bid|solicitation|procurement)\b/i.test(raw)) {
    return false;
  }
  if (
    !/(occupational|employee health|medical surveillance|fitness for duty|pre[- ]employment|drug testing|alcohol testing|audiometric|spirometry|respirator fit)/i.test(
      raw,
    )
  ) {
    return false;
  }
  return portal.country !== "US";
}

function resultToOpportunity(
  result: SerperSearchResult,
  portal: EnrichedDirectRfpPortal,
): NormalizedOpportunity | null {
  if (!isUsefulResult(result, portal)) return null;
  const metadata = extractMetadataFromText(result.snippet, result.title);
  if (metadata.deadline && metadata.deadline < new Date()) return null;
  const postedDate = parsedDate(result.date);
  const resultKey = normalizedResultKey(result.link);
  const urlHash = createHash("sha256")
    .update(resultKey)
    .digest("hex")
    .slice(0, 20);

  return {
    externalId: `international-${urlHash}`,
    title:
      result.title.trim() || "International Public Procurement Opportunity",
    agency: metadata.agencyHint ?? portal.jurisdiction,
    type: "Solicitation",
    status: "active",
    postedDate: postedDate ?? UNKNOWN_POSTED_DATE,
    responseDeadline: metadata.deadline,
    estimatedValue: metadata.estimatedValue,
    description: result.snippet,
    location: portal.jurisdiction,
    sourceUrl: result.link,
    source: "internationalPublicPortals",
    providerName: "internationalPublicPortals",
    rawData: {
      providerName: "internationalPublicPortals",
      providerFamily: "international_public_portal",
      providerType: "serper_official_international_portal",
      discoveryMethod: "serper_official_domain",
      sourceId: portal.id,
      portalName: portal.name,
      jurisdiction: portal.jurisdiction,
      country: portal.country,
      regionGroup: groupForPortal(portal.id),
      sourceConfidence: "low",
      occumedFit: portal.occumedFit,
      dateUnknown: !postedDate,
      tags: [
        "international-opportunity",
        `country:${portal.country}`,
        "official-procurement-portal",
        "serper-discovery",
        "verification-required",
        ...(!postedDate ? ["date-unknown"] : []),
      ],
      notes:
        "Search-discovered through Serper on an official international procurement domain. No direct portal connector or supplier login automation is used; verify the source page before relying on the card.",
    },
  };
}

function domainGroups(): EnrichedDirectRfpPortal[][] {
  const groups: EnrichedDirectRfpPortal[][] = [];
  for (
    let index = 0;
    index < INTERNATIONAL_PORTALS.length;
    index += MAX_DOMAINS_PER_QUERY
  ) {
    groups.push(INTERNATIONAL_PORTALS.slice(index, index + MAX_DOMAINS_PER_QUERY));
  }
  return groups;
}

export function buildInternationalPortalQueries(keywords?: string): string[] {
  const keywordExpression = keywords?.trim() ? ` (${keywords.trim()})` : "";
  return domainGroups().map((portals) => {
    const domains = portals
      .map((portal) => `site:${portal.domain}`)
      .join(" OR ");
    return `(${domains}) ${SERVICE_EXPRESSION} ${PROCUREMENT_EXPRESSION}${keywordExpression} (${CURRENT_YEAR} OR ${CURRENT_YEAR + 1}) -awarded -\"award notice\"`;
  });
}

export class InternationalPublicPortalsProvider
  implements DataSourceProvider
{
  readonly name = "internationalPublicPortals" as const;

  async isConfigured(): Promise<boolean> {
    return serperProvider.isConfigured();
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    if (!(await this.isConfigured())) {
      return {
        records: [],
        total: 0,
        errors: [
          "Serper API key not configured; international official-portal discovery is disabled.",
        ],
      };
    }

    const queries = buildInternationalPortalQueries(options.keywords);
    const results = await serperProvider.searchMultiple(queries, 10, { signal: options.signal });
    const seen = new Set<string>();
    const records: NormalizedOpportunity[] = [];
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_LIMIT, 1),
      DEFAULT_LIMIT,
    );

    for (const result of results) {
      if (!result.link) continue;
      const key = normalizedResultKey(result.link);
      if (seen.has(key)) continue;
      seen.add(key);
      const portal = portalForUrl(result.link);
      if (!portal) continue;
      const opportunity = resultToOpportunity(result, portal);
      if (!opportunity) continue;
      records.push(opportunity);
      if (records.length >= limit) break;
    }

    return { records, total: records.length, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: this.name,
      configured,
      healthy: configured,
      recordCount: INTERNATIONAL_PORTALS.length,
      errorMessage: configured
        ? undefined
        : "Uses the existing Serper key to discover public international opportunity pages.",
    };
  }
}

export const internationalPublicPortalsProvider =
  new InternationalPublicPortalsProvider();
