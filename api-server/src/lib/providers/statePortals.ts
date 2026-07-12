/**
 * State / District Direct RFP Portal Provider
 *
 * Searches only official government procurement portals from the direct RFP
 * source catalog. Aggregators are deliberately excluded from this layer.
 *
 * Wave 2 makes this provider operational through /opportunities/fetch while
 * staying quota-aware: tier-1 official portals are queried first, tier-2 only
 * when includeTier3 is explicitly requested, and tier-3 remains off by default.
 */

import { createHash } from "crypto";
import type {
  DataSourceProvider,
  FetchOptions,
  NormalizedOpportunity,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
import { serperProvider } from "./serper";
import { extractMetadataFromText } from "../search/heuristicExtract";
import { procurementSourceFlags } from "../config/env";
import {
  directRfpPortalByDomain,
  directRfpPortalsForSearch,
  type DirectRfpPortal,
} from "./directRfpPortals";
import {
  parserForPortalSource,
  type PortalCandidateOpportunity,
} from "./portal-parsers";
import {
  ALL_SERVICE_TERMS,
  HARD_REJECT_TERMS,
  PROCUREMENT_SIGNALS,
  buildOccuMedSearchQueries,
} from "../search/occumedProcurementOntology";

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;
const DEFAULT_QUERY_LIMIT = 6;
const DEFAULT_RESULT_LIMIT = 25;

type PortalGroup = "state" | "district";

export interface StatePortal {
  domain: string;
  name: string;
  state: string;
  tier: 1 | 2 | 3;
  group: PortalGroup;
  sourceId: string;
  searchUrl?: string;
}

function toStatePortal(portal: DirectRfpPortal): StatePortal | null {
  if (portal.country !== "US") return null;
  if (portal.level !== "state" && portal.level !== "district") return null;
  return {
    domain: portal.domain,
    name: portal.name,
    state: portal.state ?? portal.jurisdiction,
    tier: portal.tier,
    group: portal.level === "district" ? "district" : "state",
    sourceId: portal.id,
    searchUrl: portal.searchUrl,
  };
}

export const STATE_PORTALS: StatePortal[] = directRfpPortalsForSearch(true)
  .map(toStatePortal)
  .filter((portal): portal is StatePortal => Boolean(portal));

const PORTAL_SEARCH_TERMS = buildOccuMedSearchQueries(CURRENT_YEAR).slice(
  0,
  24,
);

const PROCURE_SIGNALS = PROCUREMENT_SIGNALS;

const OCCUMED_SERVICE_SIGNALS = ALL_SERVICE_TERMS;

const HARD_REJECT_SIGNALS = HARD_REJECT_TERMS;

function normalizeText(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
}

function hasStaleYearOnly(text: string): boolean {
  const years = Array.from(text.matchAll(/\b20\d{2}\b/g)).map((m) =>
    Number(m[0]),
  );
  if (years.length === 0) return false;
  const hasCurrentOrFuture = years.some(
    (y) => y >= CURRENT_YEAR && y <= NEXT_YEAR + 1,
  );
  const hasOld = years.some((y) => y < CURRENT_YEAR);
  return hasOld && !hasCurrentOrFuture;
}

function isPortalEnabled(portal: StatePortal): boolean {
  if (portal.group === "district") return procurementSourceFlags.state === true;
  return procurementSourceFlags.state === true;
}

function enabledPortals(includeTier3 = false): StatePortal[] {
  return STATE_PORTALS.filter(
    (portal) => isPortalEnabled(portal) && (includeTier3 || portal.tier !== 3),
  );
}

function isOfficialDirectPortalResult(url: string): boolean {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`)
      .hostname;
    return Boolean(directRfpPortalByDomain(host));
  } catch {
    return false;
  }
}

function isUsefulPortalResult(
  title: string,
  url: string,
  snippet: string,
): boolean {
  if (!isOfficialDirectPortalResult(url)) return false;

  const raw = `${title} ${url} ${snippet}`;
  const text = normalizeText(raw);

  if (hasStaleYearOnly(raw)) return false;
  if (
    HARD_REJECT_SIGNALS.some((signal) => text.includes(normalizeText(signal)))
  )
    return false;

  const hasProcurementSignal = PROCURE_SIGNALS.some((signal) =>
    text.includes(normalizeText(signal)),
  );
  const hasServiceSignal = OCCUMED_SERVICE_SIGNALS.some((signal) =>
    text.includes(normalizeText(signal)),
  );

  return hasProcurementSignal && hasServiceSignal;
}

function buildSiteQueries(portals: StatePortal[]): string[] {
  const domainStr = portals.map((p) => `site:${p.domain}`).join(" OR ");
  if (!domainStr) return [];
  return PORTAL_SEARCH_TERMS.map(
    (term) => `(${domainStr}) ${term} ${CURRENT_YEAR}`,
  );
}

function normalizeResultKey(title: string, url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return `${title}|${url}`.toLowerCase();
  }
}

function resultToOpportunity(
  title: string,
  url: string,
  snippet: string,
  parsed?: PortalCandidateOpportunity,
): NormalizedOpportunity | null {
  if (!isUsefulPortalResult(title, url, snippet)) return null;

  const urlHash = createHash("sha256").update(url).digest("hex").slice(0, 20);
  const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(
    snippet,
    title,
  );
  const parsedDeadline = parsed?.responseDeadline;
  const effectiveDeadline = parsedDeadline ?? deadline;

  if (effectiveDeadline && effectiveDeadline < new Date()) return null;

  const domainMatch = url.match(/https?:\/\/([^/]+)/);
  const urlDomain = domainMatch?.[1] ?? "";
  const directPortal = directRfpPortalByDomain(urlDomain);
  const matchedPortal = enabledPortals(true).find((p) =>
    urlDomain.toLowerCase().includes(p.domain.toLowerCase()),
  );
  const portalName =
    directPortal?.name ?? matchedPortal?.name ?? "Official State RFP Portal";
  const portalState = directPortal?.state ?? matchedPortal?.state ?? "";

  return {
    externalId: `direct-state-${urlHash}`,
    title: parsed?.title ?? title,
    agency:
      parsed?.agency ??
      agencyHint ??
      (portalState
        ? `${portalState} Government`
        : (directPortal?.jurisdiction ?? "Unknown")),
    type: "Solicitation",
    status: "active",
    postedDate: parsed?.postedDate ?? new Date(),
    responseDeadline: effectiveDeadline ?? undefined,
    estimatedValue: estimatedValue ?? undefined,
    description: parsed?.description ?? snippet,
    solicitationNumber: parsed?.solicitationNumber,
    location: parsed?.location ?? parsed?.state,
    sourceUrl: parsed?.sourceUrl ?? url,
    source: "statePortals" as const,
    rawData: {
      providerName: "direct_official_state_rfp_portals",
      portalName,
      portalState,
      portalGroup: matchedPortal?.group ?? directPortal?.level ?? "unknown",
      sourceId: directPortal?.id ?? matchedPortal?.sourceId,
      sourceConfidence:
        directPortal?.parserStatus === "ready_to_parse" ? "high" : "medium",
      tags: [
        "direct-official-portal",
        portalState ? `state:${portalState}` : "state:unknown",
      ],
      notes: `Discovered via official direct portal ${portalName}; passed procurement/service/staleness filters`,
      parserApplied: Boolean(parsed),
      parsedPortalSourceId: parsed?.portalSourceId,
      fallback: !parsed,
    },
  };
}

export class StatePortalsProvider implements DataSourceProvider {
  readonly name = "statePortals" as const;

  async isConfigured(): Promise<boolean> {
    return serperProvider.isConfigured();
  }

  async fetch(options: FetchOptions): Promise<ProviderFetchResult> {
    const configured = await this.isConfigured();
    if (!configured) {
      return {
        records: [],
        total: 0,
        errors: [
          "Serper API key not configured; official portal discovery is disabled.",
        ],
      };
    }

    const includeTier3 = Boolean((options as any).includeTier3);
    const searchResults = await this.search({
      keywords: options.keywords,
      includeTier3,
    });
    const records = this.toOpportunities(searchResults).slice(
      0,
      options.limit ?? DEFAULT_RESULT_LIMIT,
    );

    return { records, total: records.length, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: "statePortals" as any,
      configured,
      healthy: configured,
      recordCount: enabledPortals(true).length,
    };
  }

  async search(
    options: { keywords?: string; includeTier3?: boolean } = {},
  ): Promise<
    { title: string; url: string; snippet: string; portal: string }[]
  > {
    const includeTier3 = options.includeTier3 ?? false;
    const portals = enabledPortals(includeTier3);
    const tier1Queries = buildSiteQueries(portals.filter((p) => p.tier === 1));
    const tier2Queries = buildSiteQueries(portals.filter((p) => p.tier === 2));
    const tier3Queries = buildSiteQueries(portals.filter((p) => p.tier === 3));

    const keywordQueries: string[] = [];
    if (options.keywords?.trim() && portals.length > 0) {
      const kw = options.keywords.trim();
      const domainStr = portals.map((p) => `site:${p.domain}`).join(" OR ");
      keywordQueries.push(
        `(${domainStr}) (${kw}) ("occupational health" OR "drug testing" OR "DOT physical" OR "employee health") (RFP OR solicitation OR bid) ${CURRENT_YEAR} -ambulance -EMS -LVN -LPN -hiring -jobs`,
      );
    }

    const allQueries = [
      ...keywordQueries,
      ...tier1Queries,
      ...tier2Queries,
      ...tier3Queries,
    ].slice(0, DEFAULT_QUERY_LIMIT);
    if (allQueries.length === 0) return [];

    const results = await serperProvider.searchMultiple(allQueries, 10);
    const seen = new Set<string>();

    return results
      .map((r) => {
        const domainMatch = r.link.match(/https?:\/\/([^/]+)/);
        const urlDomain = domainMatch?.[1] ?? "";
        const portal =
          directRfpPortalByDomain(urlDomain)?.name ??
          portals.find((p) =>
            urlDomain.toLowerCase().includes(p.domain.toLowerCase()),
          )?.name ??
          "Official State RFP Portal";
        return { title: r.title, url: r.link, snippet: r.snippet, portal };
      })
      .filter((r) => isUsefulPortalResult(r.title, r.url, r.snippet))
      .filter((r) => {
        const key = normalizeResultKey(r.title, r.url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, DEFAULT_RESULT_LIMIT);
  }

  toOpportunities(
    results: { title: string; url: string; snippet: string; portal: string }[],
  ): NormalizedOpportunity[] {
    return results
      .flatMap((r) => {
        const domainMatch = r.url.match(/https?:\/\/([^/]+)/);
        const directPortal = directRfpPortalByDomain(domainMatch?.[1] ?? "");
        const parser = parserForPortalSource(directPortal?.id);
        const parsed =
          parser?.({
            sourceId: directPortal?.id ?? "unknown",
            data: { title: r.title, url: r.url, summary: r.snippet },
            baseUrl: directPortal?.searchUrl ?? directPortal?.url,
          }) ?? [];

        if (parsed.length === 0)
          return [resultToOpportunity(r.title, r.url, r.snippet)];
        return parsed.map((candidate) =>
          resultToOpportunity(
            candidate.title ?? r.title,
            candidate.sourceUrl ?? r.url,
            candidate.description ?? r.snippet,
            candidate,
          ),
        );
      })
      .filter((opp): opp is NormalizedOpportunity => Boolean(opp));
  }
}

export const statePortalsProvider = new StatePortalsProvider();
