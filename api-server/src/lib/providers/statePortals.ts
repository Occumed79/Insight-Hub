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
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { serperProvider } from "./serper";
import { extractMetadataFromText } from "../search/heuristicExtract";
import { procurementSourceFlags } from "../config/env";
import { directRfpPortalByDomain, directRfpPortalsForSearch, type DirectRfpPortal } from "./directRfpPortals";

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

const PORTAL_SEARCH_TERMS = [
  `"occupational health" (RFP OR "request for proposal" OR solicitation OR bid) -ambulance -EMS -LVN -LPN`,
  `"occupational medicine" (RFP OR "request for proposal" OR solicitation OR bid) -ambulance -EMS -LVN -LPN`,
  `"drug testing" OR "drug screening" services (RFP OR solicitation OR procurement) -ambulance -EMS -LVN -LPN`,
  `"pre-employment physical" OR "pre employment physical" (RFP OR bid OR solicitation) -jobs -hiring`,
  `"DOT physical" OR "DOT examination" services (contract OR bid OR solicitation) -jobs -hiring`,
  `"employee health" services (RFP OR solicitation OR "request for proposal") -staffing -nursing`,
  `"medical surveillance" program services (RFP OR bid OR solicitation)`,
  `"fit for duty" examination services solicitation`,
  `"random drug testing" services (RFP OR bid OR procurement)`,
  `"transit authority" "drug testing" OR "DOT physical" services bid`,
];

const PROCURE_SIGNALS = [
  "rfp", "request for proposal", "request for proposals", "solicitation", "invitation to bid", "invitation for bid",
  "itb", "rfq", "request for quotation", "bid opportunity", "bid notice", "sources sought", "pre-solicitation",
  "response due", "proposals due", "submission deadline", "bids due", "seeking proposals", "contract opportunity",
  "procurement notice", "sealed bid", "vendor registration", "open bid", "current bid", "public event",
];

const OCCUMED_SERVICE_SIGNALS = [
  "occupational health", "occupational medicine", "drug testing", "drug screening", "dot physical", "dot examination",
  "pre-employment physical", "pre employment physical", "employee health", "medical surveillance", "fit for duty",
  "random drug testing", "substance abuse testing", "medical examination", "medical screening", "respirator fit",
  "pulmonary function", "audiogram", "hearing test", "vaccination", "immunization", "titer", "tb test",
];

const HARD_REJECT_SIGNALS = [
  "ambulance", "emergency medical services", " ems ", "paramedic", "emt ", "fire rescue transport",
  "lvn", "lpn", "registered nurse", " rn ", "nursing services", "nurse staffing", "medical staffing",
  "job posting", "job opening", "career opportunity", "now hiring", "hiring", "needed", "position available",
  "contract awarded", "award notice", "awarded to", "selected vendor", "bid tabulation", "notice of award",
];

function normalizeText(value: string): string {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
}

function hasStaleYearOnly(text: string): boolean {
  const years = Array.from(text.matchAll(/\b20\d{2}\b/g)).map((m) => Number(m[0]));
  if (years.length === 0) return false;
  const hasCurrentOrFuture = years.some((y) => y >= CURRENT_YEAR && y <= NEXT_YEAR + 1);
  const hasOld = years.some((y) => y < CURRENT_YEAR);
  return hasOld && !hasCurrentOrFuture;
}

function isPortalEnabled(portal: StatePortal): boolean {
  if (portal.group === "district") return procurementSourceFlags.state === true;
  return procurementSourceFlags.state === true;
}

function enabledPortals(includeTier3 = false): StatePortal[] {
  return STATE_PORTALS.filter((portal) => isPortalEnabled(portal) && (includeTier3 || portal.tier !== 3));
}

function isOfficialDirectPortalResult(url: string): boolean {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return Boolean(directRfpPortalByDomain(host));
  } catch {
    return false;
  }
}

function isUsefulPortalResult(title: string, url: string, snippet: string): boolean {
  if (!isOfficialDirectPortalResult(url)) return false;

  const raw = `${title} ${url} ${snippet}`;
  const text = normalizeText(raw);

  if (hasStaleYearOnly(raw)) return false;
  if (HARD_REJECT_SIGNALS.some((signal) => text.includes(normalizeText(signal)))) return false;

  const hasProcurementSignal = PROCURE_SIGNALS.some((signal) => text.includes(normalizeText(signal)));
  const hasServiceSignal = OCCUMED_SERVICE_SIGNALS.some((signal) => text.includes(normalizeText(signal)));

  return hasProcurementSignal && hasServiceSignal;
}

function buildSiteQueries(portals: StatePortal[]): string[] {
  const domainStr = portals.map((p) => `site:${p.domain}`).join(" OR ");
  if (!domainStr) return [];
  return PORTAL_SEARCH_TERMS.map((term) => `(${domainStr}) ${term} ${CURRENT_YEAR}`);
}

function normalizeResultKey(title: string, url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return `${title}|${url}`.toLowerCase();
  }
}

function resultToOpportunity(title: string, url: string, snippet: string): NormalizedOpportunity | null {
  if (!isUsefulPortalResult(title, url, snippet)) return null;

  const urlHash = createHash("sha256").update(url).digest("hex").slice(0, 20);
  const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(snippet, title);

  if (deadline && deadline < new Date()) return null;

  const domainMatch = url.match(/https?:\/\/([^/]+)/);
  const urlDomain = domainMatch?.[1] ?? "";
  const directPortal = directRfpPortalByDomain(urlDomain);
  const matchedPortal = enabledPortals(true).find((p) => urlDomain.toLowerCase().includes(p.domain.toLowerCase()));
  const portalName = directPortal?.name ?? matchedPortal?.name ?? "Official State RFP Portal";
  const portalState = directPortal?.state ?? matchedPortal?.state ?? "";

  return {
    externalId: `direct-state-${urlHash}`,
    title,
    agency: agencyHint ?? (portalState ? `${portalState} Government` : directPortal?.jurisdiction ?? "Unknown"),
    type: "Solicitation",
    status: "active",
    postedDate: new Date(),
    responseDeadline: deadline ?? undefined,
    estimatedValue: estimatedValue ?? undefined,
    description: snippet,
    sourceUrl: url,
    source: "statePortals" as const,
    rawData: {
      providerName: "direct_official_state_rfp_portals",
      portalName,
      portalState,
      portalGroup: matchedPortal?.group ?? directPortal?.level ?? "unknown",
      sourceId: directPortal?.id ?? matchedPortal?.sourceId,
      sourceConfidence: directPortal?.parserStatus === "ready_to_parse" ? "high" : "medium",
      tags: ["direct-official-portal", portalState ? `state:${portalState}` : "state:unknown"],
      notes: `Discovered via official direct portal ${portalName}; passed procurement/service/staleness filters`,
      fallback: true,
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
      return { records: [], total: 0, errors: ["Serper API key not configured; official portal discovery is disabled."] };
    }

    const includeTier3 = Boolean((options as any).includeTier3);
    const searchResults = await this.search({ keywords: options.keywords, includeTier3 });
    const records = this.toOpportunities(searchResults).slice(0, options.limit ?? DEFAULT_RESULT_LIMIT);

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

  async search(options: { keywords?: string; includeTier3?: boolean } = {}): Promise<{ title: string; url: string; snippet: string; portal: string }[]> {
    const includeTier3 = options.includeTier3 ?? false;
    const portals = enabledPortals(includeTier3);
    const tier1Queries = buildSiteQueries(portals.filter((p) => p.tier === 1));
    const tier2Queries = buildSiteQueries(portals.filter((p) => p.tier === 2));
    const tier3Queries = buildSiteQueries(portals.filter((p) => p.tier === 3));

    const keywordQueries: string[] = [];
    if (options.keywords?.trim() && portals.length > 0) {
      const kw = options.keywords.trim();
      const domainStr = portals.map((p) => `site:${p.domain}`).join(" OR ");
      keywordQueries.push(`(${domainStr}) (${kw}) ("occupational health" OR "drug testing" OR "DOT physical" OR "employee health") (RFP OR solicitation OR bid) ${CURRENT_YEAR} -ambulance -EMS -LVN -LPN -hiring -jobs`);
    }

    const allQueries = [...keywordQueries, ...tier1Queries, ...tier2Queries, ...tier3Queries].slice(0, DEFAULT_QUERY_LIMIT);
    if (allQueries.length === 0) return [];

    const results = await serperProvider.searchMultiple(allQueries, 10);
    const seen = new Set<string>();

    return results
      .map((r) => {
        const domainMatch = r.link.match(/https?:\/\/([^/]+)/);
        const urlDomain = domainMatch?.[1] ?? "";
        const portal = directRfpPortalByDomain(urlDomain)?.name ?? portals.find((p) => urlDomain.toLowerCase().includes(p.domain.toLowerCase()))?.name ?? "Official State RFP Portal";
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

  toOpportunities(results: { title: string; url: string; snippet: string; portal: string }[]): NormalizedOpportunity[] {
    return results
      .map((r) => resultToOpportunity(r.title, r.url, r.snippet))
      .filter((opp): opp is NormalizedOpportunity => Boolean(opp));
  }
}

export const statePortalsProvider = new StatePortalsProvider();
