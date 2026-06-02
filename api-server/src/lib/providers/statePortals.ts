/**
 * State Portals Provider
 *
 * Searches a curated list of public state and regional procurement portals
 * using targeted site: queries via Serper (Google Search).
 */

import { createHash } from "crypto";
import type { DataSourceProvider, FetchOptions, NormalizedOpportunity, ProviderFetchResult, ProviderStatus } from "./types";
import { serperProvider } from "./serper";
import { extractMetadataFromText } from "../search/heuristicExtract";

const CURRENT_YEAR = new Date().getFullYear();
const NEXT_YEAR = CURRENT_YEAR + 1;

export interface StatePortal {
  domain: string;
  name: string;
  state: string;
  tier: 1 | 2 | 3;
}

export const STATE_PORTALS: StatePortal[] = [
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
  { domain: "oregon.gov",                name: "Oregon Procurement",           state: "OR", tier: 2 },
  { domain: "mn.gov",                    name: "Minnesota SWIFT",              state: "MN", tier: 2 },
  { domain: "wi.gov",                    name: "Wisconsin DOA Procurement",    state: "WI", tier: 2 },
  { domain: "mo.gov",                    name: "Missouri Office of Admin",     state: "MO", tier: 2 },
  { domain: "mass.gov",                  name: "Massachusetts COMMBUYS",       state: "MA", tier: 2 },
  { domain: "ct.gov",                    name: "Connecticut DAS Procurement",  state: "CT", tier: 2 },
  { domain: "sc.gov",                    name: "South Carolina SciQuest",      state: "SC", tier: 2 },
  { domain: "bidexpress.com",            name: "Bid Express",                  state: "National", tier: 3 },
  { domain: "negometrix.com",            name: "Negometrix (municipal)",       state: "National", tier: 3 },
  { domain: "esolutionsinc.net",         name: "eSolutions Gov Bids",          state: "National", tier: 3 },
  { domain: "civicplus.com",             name: "CivicPlus Procurement",        state: "National", tier: 3 },
  { domain: "bid4michigan.com",          name: "Bid4Michigan",                 state: "MI",       tier: 3 },
  { domain: "lacontroller.org",          name: "LA County Bids",               state: "CA",       tier: 3 },
  { domain: "purchasing.lacounty.gov",   name: "LA County Purchasing",         state: "CA",       tier: 3 },
  { domain: "sco.ca.gov",                name: "California SCO Bids",          state: "CA",       tier: 3 },
  { domain: "houstontx.gov",             name: "City of Houston Bids",         state: "TX",       tier: 3 },
  { domain: "dallascityhall.com",        name: "Dallas City Hall Procurement", state: "TX",       tier: 3 },
  { domain: "nyc.gov",                   name: "New York City PASSPort",       state: "NY",       tier: 3 },
  { domain: "chicago.gov",               name: "City of Chicago Procurement",  state: "IL",       tier: 3 },
  { domain: "phoenixoasis.com",          name: "Phoenix OASIS",                state: "AZ",       tier: 3 },
  { domain: "sanjoseca.gov",             name: "San Jose eProcurement",        state: "CA",       tier: 3 },
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
  return PORTAL_SEARCH_TERMS.map((term) => `(${domainStr}) ${term} ${CURRENT_YEAR}`);
}

function resultToOpportunity(title: string, url: string, snippet: string): NormalizedOpportunity | null {
  if (!isUsefulPortalResult(title, url, snippet)) return null;

  const urlHash = createHash("sha256").update(url).digest("hex").slice(0, 20);
  const { deadline, estimatedValue, agencyHint } = extractMetadataFromText(snippet, title);

  if (deadline && deadline < new Date()) return null;

  const domainMatch = url.match(/https?:\/\/([^/]+)/);
  const urlDomain = domainMatch?.[1] ?? "";
  const matchedPortal = STATE_PORTALS.find((p) => urlDomain.toLowerCase().includes(p.domain.toLowerCase()));
  const portalName = matchedPortal?.name ?? "State Portal";
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
      providerName: "state_portals",
      portalName,
      portalState,
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
    };
  }

  async search(options: { keywords?: string; includeTier3?: boolean } = {}): Promise<{ title: string; url: string; snippet: string; portal: string }[]> {
    const tier1 = STATE_PORTALS.filter((p) => p.tier === 1);
    const tier2 = STATE_PORTALS.filter((p) => p.tier === 2);
    const tier3 = options.includeTier3 ? STATE_PORTALS.filter((p) => p.tier === 3) : [];
    const allPortals = [...tier1, ...tier2, ...tier3];

    const tier1Queries = buildSiteQueries(tier1);
    const tier2Queries = buildSiteQueries(tier2);
    const tier3Queries = tier3.length > 0 ? buildSiteQueries(tier3) : [];

    const keywordQueries: string[] = [];
    if (options.keywords?.trim()) {
      const kw = options.keywords.trim();
      const domainStr = allPortals.map((p) => `site:${p.domain}`).join(" OR ");
      keywordQueries.push(`(${domainStr}) (${kw}) ("occupational health" OR "drug testing" OR "DOT physical" OR "employee health") (RFP OR solicitation OR bid) ${CURRENT_YEAR} -ambulance -EMS -LVN -LPN -hiring -jobs`);
    }

    const allQueries = [...keywordQueries, ...tier1Queries, ...tier2Queries, ...tier3Queries];
    const results = await serperProvider.searchMultiple(allQueries, 10);

    return results
      .map((r) => {
        const domainMatch = r.link.match(/https?:\/\/([^/]+)/);
        const urlDomain = domainMatch?.[1] ?? "";
        const portal = STATE_PORTALS.find((p) => urlDomain.toLowerCase().includes(p.domain.toLowerCase()))?.name ?? "State Portal";
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
