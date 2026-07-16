import { BsoPortalProvider, type BsoPortalConfig } from "./bsoShared";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export const BSO_PORTAL_CONFIGS: BsoPortalConfig[] = [
  {
    sourceId: "ma-commbuys",
    portalName: "Massachusetts COMMBUYS",
    state: "MA",
    agencyName: "Commonwealth of Massachusetts",
    baseUrl: "https://www.commbuys.com/bso/",
    listingUrl: "https://www.commbuys.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    envPrefix: "COMMBUYS_BSO",
  },
  {
    sourceId: "nv-epro",
    portalName: "NevadaEPro",
    state: "NV",
    agencyName: "State of Nevada",
    baseUrl: "https://nevadaepro.com/bso/",
    listingUrl: "https://nevadaepro.com/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    envPrefix: "NEVADA_EPRO_BSO",
  },
  {
    sourceId: "nj-start",
    portalName: "New Jersey START",
    state: "NJ",
    agencyName: "State of New Jersey",
    baseUrl: "https://www.njstart.gov/bso/",
    listingUrl: "https://www.njstart.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true",
    envPrefix: "NJSTART_BSO",
  },
];

export const BSO_PUBLIC_PORTAL_SOURCES: PublicPortalSource[] = BSO_PORTAL_CONFIGS.map((config) => ({
  id: config.sourceId,
  agencyName: config.portalName,
  agencyType: "state",
  state: config.state,
  sourceUrl: config.listingUrl,
  searchUrl: config.listingUrl,
  domain: new URL(config.listingUrl).hostname.replace(/^www\./, "").toLowerCase(),
  portalPlatform: "Periscope BSO",
  sourceLevel: "state",
  level: "state",
  accessMode: "public_html",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Official public open-bid listing and detail pages collected through the reusable Periscope BSO shared adapter. Supplier login is not used.",
}));

export const BSO_PORTAL_PROVIDERS = new Map(
  BSO_PORTAL_CONFIGS.map((config) => [config.sourceId, new BsoPortalProvider(config)]),
);
