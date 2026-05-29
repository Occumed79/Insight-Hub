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
  // ── Tier 1 — National aggregators (hit every state/county/municipal entity) ──
  { domain: "demandstar.com",            name: "DemandStar / OpenBids",        state: "National", tier: 1 },
  { domain: "publicpurchase.com",        name: "Public Purchase",              state: "National", tier: 1 },
  { domain: "planetbids.com",            name: "PlanetBids",                   state: "National", tier: 1 },
  { domain: "bidnetdirect.com",          name: "BidNet Direct",                state: "National", tier: 1 },
  { domain: "periscopes2g.com",          name: "Periscope S2G",                state: "National", tier: 1 },
  { domain: "ionwave.net",               name: "IonWave eProcurement",         state: "National", tier: 1 },
  { domain: "opengov.com",               name: "OpenGov Procurement",          state: "National", tier: 1 },
  { domain: "bonfirehub.com",            name: "Bonfire (municipal RFPs)",     state: "National", tier: 1 },
  { domain: "bidding.procurement.opengov.com", name: "OpenGov Bidding",        state: "National", tier: 1 },
  { domain: "bidsync.com",               name: "BidSync",                      state: "National", tier: 1 },
  { domain: "rfpdb.com",                 name: "RFP Database",                 state: "National", tier: 1 },

  // ── Tier 2 — State procurement portals ──
  { domain: "caleprocure.ca.gov",        name: "California eProcure",          state: "CA", tier: 2 },
  { domain: "txsmartbuy.gov",            name: "Texas SmartBuy",               state: "TX", tier: 2 },
  { domain: "myfloridamarketplace.myflorida.com", name: "Florida Marketplace", state: "FL", tier: 2 },
  { domain: "emaryland.maryland.gov",    name: "eMaryland Marketplace",        state: "MD", tier: 2 },
  { domain: "procurement.pa.gov",        name: "Pennsylvania eMarketplace",    state: "PA", tier: 2 },
  { domain: "procure.ohio.gov",          name: "Ohio Procure.Ohio",            state: "OH", tier: 2 },
  { domain: "gears.illinois.gov",        name: "Illinois GEARS",               state: "IL", tier: 2 },
  { domain: "doa.georgia.gov",           name: "Georgia Team Georgia Marketplace", state: "GA", tier: 2 },
  { domain: "webs.wa.gov",               name: "Washington WEBS",              state: "WA", tier: 2 },
  { domain: "bids.nc.gov",               name: "NC eProcurement",              state: "NC", tier: 2 },
  { domain: "bids.az.gov",               name: "Arizona ProcureAZ",            state: "AZ", tier: 2 },
  { domain: "michigan.gov",              name: "Michigan SIGMA",               state: "MI", tier: 2 },
  { domain: "nj.gov",                    name: "New Jersey Purchase",          state: "NJ", tier: 2 },
  { domain: "eva.virginia.gov",          name: "Virginia eVA",                 state: "VA", tier: 2 },
  { domain: "tn.gov",                    name: "Tennessee Central Procurement", state: "TN", tier: 2 },
  { domain: "vendor.colorado.gov",       name: "Colorado BIDS",                state: "CO", tier: 2 },
  { domain: "procurement.nv.gov",        name: "Nevada Purchasing Division",   state: "NV", tier: 2 },
  { domain: "Oregon.gov",                name: "Oregon Procurement",           state: "OR", tier: 2 },
  { domain: "mn.gov",                    name: "Minnesota SWIFT",              state: "MN", tier: 2 },
  { domain: "wi.gov",                    name: "Wisconsin DOA Procurement",    state: "WI", tier: 2 },
  { domain: "mo.gov",                    name: "Missouri Office of Admin",     state: "MO", tier: 2 },
  { domain: "mass.gov",                  name: "Massachusetts COMMBUYS",       state: "MA", tier: 2 },
  { domain: "ct.gov",                    name: "Connecticut DAS Procurement",  state: "CT", tier: 2 },
  { domain: "sc.gov",                    name: "South Carolina SciQuest",      state: "SC", tier: 2 },

  // ── Tier 3 — Additional regional / county / municipal portals ──
  { domain: "bidexpress.com",            name: "Bid Express",                  state: "National", tier: 3 },
  { domain: "negometrix.com",            name: "Negometrix (municipal)",       state: "National", tier: 3 },
  { domain: "esolutionsinc.net",         name: "eSolutions Gov Bids",          state: "National", tier: 3 },
  { domain: "civicplus.com",             name: "CivicPlus Procurement",        state: "National", tier: 3 },
  { domain: "bid4michigan.com",          name: "Bid4Michigan",                 state: "MI",       tier: 3 },
  { domain: "lacontroller.org",          name: "LA County Bids",               state: "CA",       tier: 3 },
  { domain: "purchasing.lacounty.gov",   name: "LA County Purchasing",         state: "CA",       tier: 3 },
  { domain: "sco.ca.gov",               name: "California SCO Bids",          state: "CA",       tier: 3 },
  { domain: "houstontx.gov",            name: "City of Houston Bids",         state: "TX",       tier: 3 },
  { domain: "dallascityhall.com",        name: "Dallas City Hall Procurement", state: "TX",       tier: 3 },
  { domain: "nyc.gov",                   name: "New York City PASSPort",       state: "NY",       tier: 3 },
  { domain: "chicago.gov",               name: "City of Chicago Procurement",  state: "IL",       tier: 3 },
  { domain: "phoenixoasis.com",          name: "Phoenix OASIS",                state: "AZ",       tier: 3 },
  { domain: "sanjoseca.gov",             name: "San Jose eProcurement",        state: "CA",       tier: 3 },
];

// ── Search query templates ────────────────────────────────────────────────────

// These queries mirror the EXACT language procurement officers use in RFP titles.
// Each query is designed to surface a distinct category of opportunity Occu-Med can bid on.
const PORTAL_SEARCH_TERMS = [
  // Core service line — most common RFP titles
  `"occupational health" RFP OR "request for proposal" OR solicitation`,
  `"drug testing" OR "drug screening" services RFP procurement`,
  `"pre-employment" physical OR screening RFP OR bid`,
  `"DOT physical" OR "DOT examination" services contract bid`,
  `"employee health" services RFP OR solicitation OR "request for proposal"`,
  `"medical surveillance" program services RFP bid`,
  `"fit for duty" examination services solicitation`,
  `"substance abuse" testing services RFP procurement`,
  // Broader occupational medicine terms
  `"occupational medicine" clinic services contract RFP`,
  `"workers compensation" medical services RFP OR bid`,
  `"workplace health" services contract solicitation`,
  `"random drug testing" services RFP bid procurement`,
  // Entity types that hire — add entity context to narrow to actual procurements
  `county "occupational health" RFP OR bid solicitation ${CURRENT_YEAR}`,
  `municipality "employee health" testing services contract ${CURRENT_YEAR}`,
  `"school district" "drug testing" services RFP OR bid`,
  `"transit authority" "drug testing" OR "DOT physical" services bid`,
  `"police department" OR "fire department" "physical examination" services RFP`,
  `"public works" "pre-employment" OR "occupational health" RFP services`,
  // Private sector / NGO / hospital employers
  `"occupational health" services vendor "request for proposal"`,
  `"employee assistance program" EAP services RFP procurement`,
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
    source: "statePortals" as const,
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
