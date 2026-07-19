import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export interface StatewidePortalConfig {
  portalId: string;
  buyerName: string;
  state: string;
  platform: string;
  listingUrl: string;
  alternateListingUrls?: readonly string[];
  origin: string;
  sourceBadge: string;
}

export const STATEWIDE_PORTAL_CONFIGS: readonly StatewidePortalConfig[] = [
  { portalId: "fl-vbs", buyerName: "State of Florida", state: "FL", platform: "Florida Vendor Bid System / MyFloridaMarketPlace", listingUrl: "https://vendor.myfloridamarketplace.com/search/bids", origin: "https://vendor.myfloridamarketplace.com", sourceBadge: "Florida Vendor Bid System" },
  { portalId: "ga-gpr", buyerName: "State of Georgia", state: "GA", platform: "Georgia Procurement Registry", listingUrl: "https://ssl.doas.state.ga.us/gpr/", origin: "https://ssl.doas.state.ga.us", sourceBadge: "Georgia Procurement Registry" },
  { portalId: "la-lapac", buyerName: "State of Louisiana", state: "LA", platform: "Louisiana Procurement and Contract Network / LaPAC", listingUrl: "https://wwwcfprd.doa.louisiana.gov/osp/lapac/deptbids.cfm", alternateListingUrls: ["https://wwwcfprd.doa.louisiana.gov/osp/lapac/catbids.cfm", "https://wwwcfprd.doa.louisiana.gov/osp/lapac/srchopen.cfm"], origin: "https://wwwcfprd.doa.louisiana.gov", sourceBadge: "Louisiana LaPAC" },
  { portalId: "me-rfps", buyerName: "State of Maine", state: "ME", platform: "Maine Vendor Self-Service", listingUrl: "https://mevss.hostams.com/PRDVSS1X1/AltSelfService", origin: "https://mevss.hostams.com", sourceBadge: "Maine Vendor Self-Service" },
  { portalId: "ms-magic", buyerName: "State of Mississippi", state: "MS", platform: "Mississippi Procurement Opportunity Search / MAGIC", listingUrl: "https://www.ms.gov/dfa/contract_bid_search/Bid", origin: "https://www.ms.gov", sourceBadge: "Mississippi Procurement Opportunity Search" },
  { portalId: "nm-active-procurements", buyerName: "State of New Mexico", state: "NM", platform: "New Mexico State Purchasing Active Procurements", listingUrl: "https://generalservices.state.nm.us/state-purchasing/active-itbs-and-rfps/active-procurements/", origin: "https://generalservices.state.nm.us", sourceBadge: "New Mexico Active Procurements" },
  { portalId: "mi-sigma", buyerName: "State of Michigan", state: "MI", platform: "Michigan SIGMA Vendor Self-Service", listingUrl: "https://sigma.michigan.gov/webapp/PRDVSS2X1/AltSelfService", origin: "https://sigma.michigan.gov", sourceBadge: "Michigan SIGMA VSS" },
  { portalId: "pa-emarketplace", buyerName: "Commonwealth of Pennsylvania", state: "PA", platform: "Pennsylvania eMarketplace", listingUrl: "https://www.emarketplace.state.pa.us/Solicitations.aspx", origin: "https://www.emarketplace.state.pa.us", sourceBadge: "Pennsylvania eMarketplace" },
  { portalId: "va-eva", buyerName: "Commonwealth of Virginia", state: "VA", platform: "Virginia eVA", listingUrl: "https://eva.virginia.gov/business-opportunities.html", origin: "https://eva.virginia.gov", sourceBadge: "Virginia eVA" },
  { portalId: "oh-ohiobuys", buyerName: "State of Ohio", state: "OH", platform: "OhioBuys / Ohio Procurement", listingUrl: "https://procure.ohio.gov/proc/view-procurement-opportunities", origin: "https://procure.ohio.gov", sourceBadge: "Ohio Procurement Opportunities" },
  { portalId: "md-emma", buyerName: "State of Maryland", state: "MD", platform: "eMaryland Marketplace Advantage", listingUrl: "https://emma.maryland.gov/page.aspx/en/rfp/request_browse_public", origin: "https://emma.maryland.gov", sourceBadge: "eMaryland Marketplace Advantage" },
  { portalId: "nc-evp", buyerName: "State of North Carolina", state: "NC", platform: "North Carolina electronic Vendor Portal", listingUrl: "https://evp.nc.gov/solicitations/", origin: "https://evp.nc.gov", sourceBadge: "North Carolina eVP" },
] as const;

export const STATEWIDE_PROCUREMENT_PORTAL_IDS = new Set(STATEWIDE_PORTAL_CONFIGS.map((source) => source.portalId));

export const STATEWIDE_PROCUREMENT_SOURCES: PublicPortalSource[] = STATEWIDE_PORTAL_CONFIGS.map((source) => ({
  id: source.portalId,
  agencyName: source.buyerName,
  agencyType: "state",
  state: source.state,
  sourceUrl: source.listingUrl,
  searchUrl: source.listingUrl,
  domain: new URL(source.listingUrl).hostname,
  portalPlatform: source.platform,
  sourceLevel: "state",
  level: "state",
  accessMode: "public_html",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: `Dedicated public listing/detail adapter for ${source.sourceBadge}.`,
}));
