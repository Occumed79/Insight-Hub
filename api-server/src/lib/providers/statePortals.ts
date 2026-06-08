/**
 * State / Local Procurement Sources Provider
 *
 * Searches a curated list of public state, county, city, municipal, local-gov,
 * university, and regional procurement portals using targeted site: queries via
 * Serper (Google Search). Source groups are controlled by Render feature flags.
 */

import { createHash } from "crypto";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { serperProvider } from "./serper";
import { extractMetadataFromText } from "../search/heuristicExtract";
import { procurementSourceFlags } from "../config/env";

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

type PortalGroup = "state" | "county" | "city" | "municipal" | "localGov" | "university" | "national";

export interface StatePortal {
  domain: string;
  name: string;
  state: string;
  tier: 1 | 2 | 3;
  group: PortalGroup;
}

export const STATE_PORTALS: StatePortal[] = [
  { domain: "demandstar.com",            name: "DemandStar / OpenBids",        state: "National", tier: 1, group: "national" },
  { domain: "publicpurchase.com",        name: "Public Purchase",              state: "National", tier: 1, group: "national" },
  { domain: "planetbids.com",            name: "PlanetBids",                   state: "National", tier: 1, group: "national" },
  { domain: "bidnetdirect.com",          name: "BidNet Direct",                state: "National", tier: 1, group: "national" },
  { domain: "periscopes2g.com",          name: "Periscope S2G",                state: "National", tier: 1, group: "national" },
  { domain: "ionwave.net",               name: "IonWave eProcurement",         state: "National", tier: 1, group: "national" },
  { domain: "opengov.com",               name: "OpenGov Procurement",          state: "National", tier: 1, group: "national" },
  { domain: "bonfirehub.com",            name: "Bonfire",                      state: "National", tier: 1, group: "national" },
  { domain: "bidding.procurement.opengov.com", name: "OpenGov Bidding",        state: "National", tier: 1, group: "national" },
  { domain: "bidsync.com",               name: "BidSync",                      state: "National", tier: 1, group: "national" },
  { domain: "rfpdb.com",                 name: "RFP Database",                 state: "National", tier: 1, group: "national" },

  { domain: "caleprocure.ca.gov",        name: "California eProcure",          state: "CA", tier: 2, group: "state" },
  { domain: "txsmartbuy.gov",            name: "Texas SmartBuy",               state: "TX", tier: 2, group: "state" },
  { domain: "myfloridamarketplace.myflorida.com", name: "Florida Marketplace", state: "FL", tier: 2, group: "state" },
  { domain: "emaryland.maryland.gov",    name: "eMaryland Marketplace",        state: "MD", tier: 2, group: "state" },
  { domain: "procurement.pa.gov",        name: "Pennsylvania eMarketplace",    state: "PA", tier: 2, group: "state" },
  { domain: "procure.ohio.gov",          name: "Ohio Procure.Ohio",            state: "OH", tier: 2, group: "state" },
  { domain: "gears.illinois.gov",        name: "Illinois GEARS",               state: "IL", tier: 2, group: "state" },
  { domain: "doa.georgia.gov",           name: "Georgia Team Georgia Marketplace", state: "GA", tier: 2, group: "state" },
  { domain: "webs.wa.gov",               name: "Washington WEBS",              state: "WA", tier: 2, group: "state" },
  { domain: "bids.nc.gov",               name: "NC eProcurement",              state: "NC", tier: 2, group: "state" },
  { domain: "bids.az.gov",               name: "Arizona ProcureAZ",            state: "AZ", tier: 2, group: "state" },
  { domain: "michigan.gov",              name: "Michigan SIGMA",               state: "MI", tier: 2, group: "state" },
  { domain: "nj.gov",                    name: "New Jersey Purchase",          state: "NJ", tier: 2, group: "state" },
  { domain: "eva.virginia.gov",          name: "Virginia eVA",                 state: "VA", tier: 2, group: "state" },
  { domain: "tn.gov",                    name: "Tennessee Central Procurement", state: "TN", tier: 2, group: "state" },
  { domain: "vendor.colorado.gov",       name: "Colorado BIDS",                state: "CO", tier: 2, group: "state" },
  { domain: "procurement.nv.gov",        name: "Nevada Purchasing Division",   state: "NV", tier: 2, group: "state" },
  { domain: "oregon.gov",                name: "Oregon Procurement",           state: "OR", tier: 2, group: "state" },
  { domain: "mn.gov",                    name: "Minnesota SWIFT",              state: "MN", tier: 2, group: "state" },
  { domain: "wi.gov",                    name: "Wisconsin DOA Procurement",    state: "WI", tier: 2, group: "state" },
  { domain: "mo.gov",                    name: "Missouri Office of Admin",     state: "MO", tier: 2, group: "state" },
  { domain: "mass.gov",                  name: "Massachusetts COMMBUYS",       state: "MA", tier: 2, group: "state" },
  { domain: "ct.gov",                    name: "Connecticut DAS Procurement",  state: "CT", tier: 2, group: "state" },
  { domain: "sc.gov",                    name: "South Carolina SciQuest",      state: "SC", tier: 2, group: "state" },

  { domain: "bidexpress.com",            name: "Bid Express",                  state: "National", tier: 3, group: "localGov" },
  { domain: "negometrix.com",            name: "Negometrix",                   state: "National", tier: 3, group: "municipal" },
  { domain: "esolutionsinc.net",         name: "eSolutions Gov Bids",          state: "National", tier: 3, group: "localGov" },
  { domain: "civicplus.com",             name: "CivicPlus Procurement",        state: "National", tier: 3, group: "municipal" },
  { domain: "bid4michigan.com",          name: "Bid4Michigan",                 state: "MI",       tier: 3, group: "localGov" },
  { domain: "lacontroller.org",          name: "LA County Bids",               state: "CA",       tier: 3, group: "county" },
  { domain: "purchasing.lacounty.gov",   name: "LA County Purchasing",         state: "CA",       tier: 3, group: "county" },
  { domain: "sco.ca.gov",                name: "California SCO Bids",          state: "CA",       tier: 3, group: "state" },
  { domain: "houstontx.gov",             name: "City of Houston Bids",         state: "TX",       tier: 3, group: "city" },
  { domain: "dallascityhall.com",        name: "Dallas City Hall Procurement", state: "TX",       tier: 3, group: "city" },
  { domain: "nyc.gov",                   name: "New York City PASSPort",       state: "NY",       tier: 3, group: "city" },
  { domain: "chicago.gov",               name: "City of Chicago Procurement",  state: "IL",       tier: 3, group: "city" },
  { domain: "phoenixoasis.com",          name: "Phoenix OASIS",                state: "AZ",       tier: 3, group: "city" },
  { domain: "sanjoseca.gov",             name: "San Jose eProcurement",        state: "CA",       tier: 3, group: "city" },
  { domain: "universitybid.com",         name: "University Bid",               state: "National", tier: 3, group: "university" },
  { domain: "purchasing.utexas.edu",     name: "University of Texas Purchasing", state: "TX",     tier: 3, group: "university" },
  { domain: "procurement.ufl.edu",       name: "University of Florida Procurement", state: "FL",  tier: 3, group: "university" },
];

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
  "procurement notice", "sealed bid", "vendor registration",
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
  if (portal.group === "national") return true;
  return procurementSourceFlags[portal.group] === true;
}

function enabledPortals(includeTier3 = false): StatePortal[] {
  return STATE_PORTALS.filter((portal) => isPortalEnabled(portal) && (includeTier3 || portal.tier !== 3));
}

function isUsefulPortalResult(title: string, url: string, snippet: string): boolean {
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

function resultToOpportunity(title: string, url: string, snippet: string): NormalizedOpportunity | null {
  if (!isUsefulPortalResult(title, url, snippet)) return null;

  const urlHash = createHash("sha256").update(url).digest("hex").slice(0, 20);
  const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(snippet, title);

  if (deadline && deadline < new Date()) return null;

  const domainMatch = url.match(/https?:\/\/([^/]+)/);
  const urlDomain = domainMatch?.[1] ?? "";
  const matchedPortal = enabledPortals(true).find((p) => urlDomain.toLowerCase().includes(p.domain.toLowerCase()));
  const portalName = matchedPortal?.name ?? "State / Local Portal";
  const portalState = matchedPortal?.state ?? "";

  return {
    externalId: `state-${urlHash}`,
    title,
    agency: agencyHint ?? (portalState && portalState !== "National" ? `${portalState} Government` : "Unknown"),
    type: "Solicitation",
    status: "active",
    postedDate: new Date(),
    responseDeadline: deadline ?? undefined,
    estimatedValue: estimatedValue ?? undefined,
    description: snippet,
    sourceUrl: url,
    source: "statePortals" as const,
    rawData: {
      providerName: "state_local_procurement_sources",
      portalName,
      portalState,
      portalGroup: matchedPortal?.group ?? "unknown",
      sourceConfidence: "medium",
      notes: `Discovered via ${portalName}; passed procurement/service/staleness filters`,
      fallback: true,
    },
  };
}

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
      recordCount: enabledPortals(true).length,
    };
  }

  async search(options: { keywords?: string; includeTier3?: boolean } = {}): Promise<{ title: string; url: string; snippet: string; portal: string }[]> {
    const includeTier3 = options.includeTier3 ?? true;
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

    const allQueries = [...keywordQueries, ...tier1Queries, ...tier2Queries, ...tier3Queries];
    if (allQueries.length === 0) return [];

    const results = await serperProvider.searchMultiple(allQueries, 10);

    return results
      .map((r) => {
        const domainMatch = r.link.match(/https?:\/\/([^/]+)/);
        const urlDomain = domainMatch?.[1] ?? "";
        const portal = portals.find((p) => urlDomain.toLowerCase().includes(p.domain.toLowerCase()))?.name ?? "State / Local Portal";
        return { title: r.title, url: r.link, snippet: r.snippet, portal };
      })
      .filter((r) => isUsefulPortalResult(r.title, r.url, r.snippet));
  }

  toOpportunities(results: { title: string; url: string; snippet: string; portal: string }[]): NormalizedOpportunity[] {
    return results
      .map((r) => resultToOpportunity(r.title, r.url, r.snippet))
      .filter((opp): opp is NormalizedOpportunity => Boolean(opp));
  }
}

export const statePortalsProvider = new StatePortalsProvider();