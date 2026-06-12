/**
 * Source Monitor Registry
 *
 * Curated list of approved intelligence sources. This is the single source of
 * truth for what the Source Intelligence Monitor is allowed to scrape.
 * No arbitrary URLs are accepted — the refresh endpoints only accept sourceIds
 * present in this registry.
 */

export type ScrapeStrategy =
  | "generic_news_page"
  | "rss_or_xml"
  | "government_listing"
  | "procurement_portal"
  | "contractor_newsroom"
  | "fallback_metadata";

export interface MonitoredSource {
  id: string;
  name: string;
  category: string;
  url: string;
  sourceType: "page";
  enabled: boolean;
  scrapeStrategy: ScrapeStrategy;
  maxItemsPerRun: number;
  timeoutMs: number;
}

export const MONITORED_SOURCES: MonitoredSource[] = [
  // ── Contractor Newsrooms ──────────────────────────────────────────────────
  { id: "v2x", name: "V2X", url: "https://www.v2x.com/newsroom/", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "amentum", name: "Amentum", url: "https://www.amentum.com/news/", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "kbr", name: "KBR", url: "https://www.kbr.com/en/newsroom", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "leidos", name: "Leidos", url: "https://www.leidos.com/newsroom", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "caci", name: "CACI", url: "https://www.caci.com/news", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "booz-allen", name: "Booz Allen", url: "https://www.boozallen.com/e/media.html", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "rtx", name: "RTX", url: "https://www.rtx.com/news", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "lockheed", name: "Lockheed Martin", url: "https://news.lockheedmartin.com/", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "northrop", name: "Northrop Grumman", url: "https://news.northropgrumman.com/", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "gd", name: "General Dynamics", url: "https://www.gd.com/news", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "boeing-defense", name: "Boeing Defense", url: "https://www.boeing.com/defense/news", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "parsons", name: "Parsons", url: "https://www.parsons.com/newsroom/", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "saic", name: "SAIC", url: "https://www.saic.com/newsroom", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "serco-na", name: "Serco North America", url: "https://www.serco.com/na/news", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "akima", name: "Akima", url: "https://www.akima.com/news/", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "peraton", name: "Peraton", url: "https://www.peraton.com/news/", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "mantech", name: "ManTech", url: "https://www.mantech.com/news/", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "fluor", name: "Fluor", url: "https://newsroom.fluor.com/", category: "Contractor Newsrooms", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },

  // ── Federal Procurement / Awards ───────────────────────────────────────────
  { id: "defense-contracts", name: "Defense.gov Contracts", url: "https://www.defense.gov/News/Contracts/", category: "Federal Procurement / Awards", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "sam-opps", name: "SAM.gov Opportunities", url: "https://sam.gov/content/opportunities", category: "Federal Procurement / Awards", sourceType: "page", enabled: true, scrapeStrategy: "procurement_portal", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "usaspending", name: "USAspending", url: "https://www.usaspending.gov/", category: "Federal Procurement / Awards", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "grants-gov", name: "Grants.gov", url: "https://www.grants.gov/", category: "Federal Procurement / Awards", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "acquisition-gov", name: "Acquisition.gov", url: "https://www.acquisition.gov/", category: "Federal Procurement / Awards", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "acquisition-far-rss", name: "Acquisition.gov FAR RSS", url: "https://www.acquisition.gov/far-site/rss", category: "Federal Procurement / Awards", sourceType: "page", enabled: true, scrapeStrategy: "rss_or_xml", maxItemsPerRun: 10, timeoutMs: 15000 },

  // ── Regulatory / Rulemaking ────────────────────────────────────────────────
  { id: "federal-register", name: "Federal Register", url: "https://www.federalregister.gov/", category: "Regulatory / Rulemaking", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "regulations-gov", name: "Regulations.gov", url: "https://www.regulations.gov/", category: "Regulatory / Rulemaking", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "govinfo", name: "GovInfo", url: "https://www.govinfo.gov/", category: "Regulatory / Rulemaking", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "congress-gov", name: "Congress.gov", url: "https://www.congress.gov/", category: "Regulatory / Rulemaking", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },

  // ── Oversight / Pain Points ───────────────────────────────────────────────
  { id: "oversight-gov", name: "Oversight.gov", url: "https://www.oversight.gov/", category: "Oversight / Pain Points", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "oversight-reports", name: "Oversight.gov Reports", url: "https://www.oversight.gov/reports", category: "Oversight / Pain Points", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "gao-reports", name: "GAO Reports", url: "https://www.gao.gov/reports-testimonies", category: "Oversight / Pain Points", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "gao-bid-protests", name: "GAO Bid Protests", url: "https://www.gao.gov/legal/bid-protests", category: "Oversight / Pain Points", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "dod-oig", name: "DoD OIG", url: "https://www.dodig.mil/", category: "Oversight / Pain Points", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "dhs-oig", name: "DHS OIG", url: "https://www.oig.dhs.gov/", category: "Oversight / Pain Points", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "hhs-oig", name: "HHS OIG", url: "https://oig.hhs.gov/", category: "Oversight / Pain Points", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "doj-oig", name: "DOJ OIG", url: "https://oig.justice.gov/", category: "Oversight / Pain Points", sourceType: "page", enabled: true, scrapeStrategy: "contractor_newsroom", maxItemsPerRun: 10, timeoutMs: 15000 },

  // ── Workforce / Demand ────────────────────────────────────────────────────
  { id: "usajobs", name: "USAJOBS", url: "https://www.usajobs.gov/", category: "Workforce / Demand", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "bls", name: "BLS", url: "https://www.bls.gov/", category: "Workforce / Demand", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "dol-warn", name: "DOL WARN", url: "https://www.dol.gov/agencies/eta/layoffs/warn", category: "Workforce / Demand", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },

  // ── Medical / Deployment / Occu-Med ─────────────────────────────────────
  { id: "cdc-travel", name: "CDC Travel Notices", url: "https://wwwnc.cdc.gov/travel/notices", category: "Medical / Deployment / Occu-Med", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "state-dept-travel", name: "State Dept Travel Advisories", url: "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html/", category: "Medical / Deployment / Occu-Med", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "fmcsa-medical", name: "FMCSA Medical", url: "https://www.fmcsa.dot.gov/regulations/medical", category: "Medical / Deployment / Occu-Med", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "fmcsa-registry", name: "FMCSA National Registry", url: "https://nationalregistry.fmcsa.dot.gov/", category: "Medical / Deployment / Occu-Med", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "faa-ame", name: "FAA AME Guide", url: "https://www.faa.gov/ame_guide", category: "Medical / Deployment / Occu-Med", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "osha-news", name: "OSHA News Releases", url: "https://www.osha.gov/news/newsreleases", category: "Medical / Deployment / Occu-Med", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "osha-data", name: "OSHA Data", url: "https://www.osha.gov/data", category: "Medical / Deployment / Occu-Med", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "osha-enforcement", name: "OSHA Enforcement", url: "https://www.osha.gov/ords/imis/establishment.html", category: "Medical / Deployment / Occu-Med", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },

  // ── State / Local Procurement ─────────────────────────────────────────────
  { id: "naspo", name: "NASPO State Procurement Directory", url: "https://www.naspo.org/states/", category: "State / Local Procurement", sourceType: "page", enabled: true, scrapeStrategy: "government_listing", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "cal-eprocure", name: "Cal eProcure", url: "https://caleprocure.ca.gov/", category: "State / Local Procurement", sourceType: "page", enabled: true, scrapeStrategy: "procurement_portal", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "colorado-vss", name: "Colorado VSS", url: "https://codpa-vss.cloud.cgifederal.com/webapp/PRDVSS2X1/AltSelfService", category: "State / Local Procurement", sourceType: "page", enabled: true, scrapeStrategy: "procurement_portal", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "texas-smartbuy", name: "Texas SmartBuy", url: "https://www.txsmartbuy.gov/", category: "State / Local Procurement", sourceType: "page", enabled: true, scrapeStrategy: "procurement_portal", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "florida-vendor", name: "Florida Vendor Bid System", url: "https://vendor.myfloridamarketplace.com/", category: "State / Local Procurement", sourceType: "page", enabled: true, scrapeStrategy: "procurement_portal", maxItemsPerRun: 10, timeoutMs: 15000 },
  { id: "nys-contracts", name: "NYS Contract Reporter", url: "https://www.nyscr.ny.gov/", category: "State / Local Procurement", sourceType: "page", enabled: true, scrapeStrategy: "procurement_portal", maxItemsPerRun: 10, timeoutMs: 15000 },
];

const SOURCE_MAP = new Map<string, MonitoredSource>();
for (const s of MONITORED_SOURCES) {
  SOURCE_MAP.set(s.id, s);
}

export function getSourceById(id: string): MonitoredSource | undefined {
  return SOURCE_MAP.get(id);
}

export function getAllSources(): MonitoredSource[] {
  return MONITORED_SOURCES;
}

export function getEnabledSources(): MonitoredSource[] {
  return MONITORED_SOURCES.filter((s) => s.enabled);
}

export function isValidSourceId(id: string): boolean {
  return SOURCE_MAP.has(id);
}
