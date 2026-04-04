/**
 * State Portals Provider
 *
 * Searches a curated list of public state and regional procurement portals
 * using targeted site: queries via Serper (Google Search).
 *
 * No new API keys required — piggybacks on the existing Serper connection.
 * Portals are organised by tier:
 *   Tier 1 — National aggregators (broadest coverage)
 *   Tier 2 — High-volume state portals
 *   Tier 3 — Additional regional portals
 */

import { createHash } from "crypto";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { serperProvider } from "./serper";
import { extractMetadataFromText } from "../search/heuristicExtract";

const CURRENT_YEAR = new Date().getFullYear();

// ── Portal registry ───────────────────────────────────────────────────────────

export interface StatePortal {
  domain: string;
  name: string;
  state: string; // "National" for aggregators
  tier: 1 | 2 | 3;
}

export const STATE_PORTALS: StatePortal[] = [
  // Tier 1 — National aggregators
  { domain: "demandstar.com",           name: "DemandStar",                  state: "National", tier: 1 },
  { domain: "govtribe.com",             name: "GovTribe",                    state: "National", tier: 1 },
  { domain: "bidnetdirect.com",         name: "BidNet Direct (Public)",      state: "National", tier: 1 },
  { domain: "periscopes2g.com",         name: "Periscope S2G",               state: "National", tier: 1 },
  { domain: "publicpurchase.com",       name: "Public Purchase",             state: "National", tier: 1 },
  { domain: "planetbids.com",           name: "PlanetBids",                  state: "National", tier: 1 },
  { domain: "ionwave.net",              name: "IonWave eProcurement",        state: "National", tier: 1 },

  // Tier 2 — High-volume state portals
  { domain: "caleprocure.ca.gov",       name: "California eProcure",         state: "CA", tier: 2 },
  { domain: "txsmartbuy.gov",           name: "Texas SmartBuy",              state: "TX", tier: 2 },
  { domain: "myfloridamarketplace.myflorida.com", name: "Florida Marketplace", state: "FL", tier: 2 },
  { domain: "emaryland.maryland.gov",   name: "eMaryland Marketplace",       state: "MD", tier: 2 },
  { domain: "procurement.pa.gov",       name: "Pennsylvania eMarketplace",   state: "PA", tier: 2 },
  { domain: "commerce.ohio.gov",        name: "Ohio Procurement",            state: "OH", tier: 2 },
  { domain: "gears.illinois.gov",       name: "Illinois GEARS",              state: "IL", tier: 2 },
  { domain: "gab.georgia.gov",          name: "Georgia Bids & Contracts",    state: "GA", tier: 2 },
  { domain: "webs.wa.gov",              name: "Washington WEBS",             state: "WA", tier: 2 },
  { domain: "bids.nc.gov",             name: "NC eProcurement",             state: "NC", tier: 2 },

  // Tier 3 — Additional regional portals
  { domain: "bids.az.gov",             name: "Arizona ProcureAZ",           state: "AZ", tier: 3 },
  { domain: "bidexpress.com",           name: "Bid Express",                 state: "National", tier: 3 },
  { domain: "co.colorado.gov",          name: "Colorado BIDS",               state: "CO", tier: 3 },
  { domain: "michigan.gov",             name: "Michigan SIGMA",              state: "MI", tier: 3 },
  { domain: "nj.gov",                   name: "New Jersey Division of Purchase", state: "NJ", tier: 3 },
  { domain: "doa.virginia.gov",         name: "Virginia eVA",                state: "VA", tier: 3 },
  { domain: "tn.gov",                   name: "Tennessee Central Procurement", state: "TN", tier: 3 },
];

// ── Search query templates ────────────────────────────────────────────────────

const PORTAL_SEARCH_TERMS = [
  `occupational health services RFP solicitation ${CURRENT_YEAR}`,
  `pre-employment drug testing screening government contract ${CURRENT_YEAR}`,
  `employee health wellness clinic services bid ${CURRENT_YEAR}`,
  `occupational medicine DOT physical services procurement ${CURRENT_YEAR}`,
  `workers compensation medical services contract ${CURRENT_YEAR}`,
];

/**
 * Build site: queries for a given tier of portals.
 * Groups multiple portal domains into a single OR query.
 */
function buildSiteQueries(portals: StatePortal[]): string[] {
  const domainStr = portals.map((p) => `site:${p.domain}`).join(" OR ");
  return PORTAL_SEARCH_TERMS.map((term) => `(${domainStr}) ${term}`);
}

// ── Candidate → NormalizedOpportunity ─────────────────────────────────────────

function resultToOpportunity(title: string, url: string, snippet: string): NormalizedOpportunity {
  const urlHash = createHash("sha256").update(url).digest("hex").slice(0, 20);
  const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(snippet, title);

  // Try to derive agency hint from the URL domain
  const domainMatch = url.match(/https?:\/\/([^/]+)/);
  const urlDomain = domainMatch?.[1] ?? "";
  const matchedPortal = STATE_PORTALS.find((p) => urlDomain.includes(p.domain));
  const portalName = matchedPortal?.name ?? "State Portal";
  const portalState = matchedPortal?.state ?? "";

  const isExpired = deadline != null && deadline < new Date();

  return {
    externalId: `state-${urlHash}`,
    title,
    agency: agencyHint ?? (portalState && portalState !== "National" ? `${portalState} Government` : "Unknown"),
    type: "Solicitation",
    status: isExpired ? "archived" : "active",
    postedDate: new Date(),
    responseDeadline: deadline ?? undefined,
    estimatedValue: estimatedValue ?? undefined,
    description: snippet,
    sourceUrl: url,
    source: "manual" as const,
    rawData: {
      providerName: "state_portals",
      portalName,
      portalState,
      sourceConfidence: "low",
      notes: `Discovered via ${portalName} — review full listing for complete details`,
      fallback: true,
    },
  };
}

// ── Provider class ─────────────────────────────────────────────────────────────

export class StatePortalsProvider implements DataSourceProvider {
  readonly name = "statePortals" as const;

  async isConfigured(): Promise<boolean> {
    return serperProvider.isConfigured();
  }

  async fetch(_options: FetchOptions): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    const configured = await this.isConfigured();
    return {
      name: "statePortals" as any,
      configured,
      healthy: configured,
    };
  }

  /**
   * Search state portals via targeted site: queries.
   * Runs Tier 1 portals first (national aggregators), then Tier 2 high-volume
   * state portals. Tier 3 only runs if explicitly requested.
   */
  async search(
    options: { keywords?: string; includeTier3?: boolean } = {}
  ): Promise<{ title: string; url: string; snippet: string; portal: string }[]> {
    const tier1 = STATE_PORTALS.filter((p) => p.tier === 1);
    const tier2 = STATE_PORTALS.filter((p) => p.tier === 2);
    const tier3 = options.includeTier3 ? STATE_PORTALS.filter((p) => p.tier === 3) : [];

    const allPortals = [...tier1, ...tier2, ...tier3];

    // Build queries — one batch per tier to avoid overly long query strings
    const tier1Queries = buildSiteQueries(tier1);
    const tier2Queries = buildSiteQueries(tier2);
    const tier3Queries = tier3.length > 0 ? buildSiteQueries(tier3) : [];

    // If the user has custom keywords, prepend a keyword-specific site: search
    const keywordQueries: string[] = [];
    if (options.keywords?.trim()) {
      const kw = options.keywords.trim();
      const domainStr = allPortals.map((p) => `site:${p.domain}`).join(" OR ");
      keywordQueries.push(`(${domainStr}) "${kw}" RFP OR solicitation OR bid ${CURRENT_YEAR}`);
    }

    const allQueries = [...keywordQueries, ...tier1Queries, ...tier2Queries, ...tier3Queries];

    const results = await serperProvider.searchMultiple(allQueries, 10);

    return results.map((r) => {
      const domainMatch = r.link.match(/https?:\/\/([^/]+)/);
      const urlDomain = domainMatch?.[1] ?? "";
      const portal = STATE_PORTALS.find((p) => urlDomain.includes(p.domain))?.name ?? "State Portal";
      return { title: r.title, url: r.link, snippet: r.snippet, portal };
    });
  }

  /**
   * Convert raw search results into NormalizedOpportunity records.
   */
  toOpportunities(
    results: { title: string; url: string; snippet: string; portal: string }[]
  ): NormalizedOpportunity[] {
    return results.map((r) => resultToOpportunity(r.title, r.url, r.snippet));
  }
}

export const statePortalsProvider = new StatePortalsProvider();
