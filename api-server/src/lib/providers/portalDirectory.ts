import type { DirectRfpPortal } from "./directRfpPortals";

/**
 * Official procurement portals added specifically for the user-facing portal
 * directory. These remain source-of-truth links; catalog inclusion does not
 * imply that a dedicated parser is already available.
 */
export const ADDITIONAL_DIRECTORY_PORTALS: DirectRfpPortal[] = [
  {
    id: "ca-los-angeles-ramp",
    name: "Los Angeles Regional Alliance Marketplace (RAMP)",
    jurisdiction: "City of Los Angeles",
    state: "CA",
    country: "US",
    level: "district",
    url: "https://www.rampla.org/s/",
    searchUrl: "https://www.rampla.org/s/",
    domain: "rampla.org",
    accessMode: "dynamic_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "needs_parser",
    notes:
      "Official City of Los Angeles regional procurement marketplace. Public entry point; supplier registration may be required for documents or responses.",
  },
  {
    id: "wa-webs",
    name: "Washington Electronic Business Solution (WEBS)",
    jurisdiction: "Washington",
    state: "WA",
    country: "US",
    level: "state",
    url: "https://pr-webs-vendor.des.wa.gov/",
    searchUrl: "https://pr-webs-vendor.des.wa.gov/",
    domain: "pr-webs-vendor.des.wa.gov",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "needs_parser",
    notes:
      "Official Washington Department of Enterprise Services vendor and solicitation portal. Registration may be required for full bid participation.",
  },
  {
    id: "ca-seao-quebec",
    name: "SEAO Québec",
    jurisdiction: "Québec",
    country: "CA",
    level: "international",
    url: "https://www.seao.gouv.qc.ca/",
    searchUrl: "https://www.seao.gouv.qc.ca/",
    domain: "seao.gouv.qc.ca",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "catalog_only",
    notes:
      "Official Québec electronic tendering system for public procurement notices.",
  },
  {
    id: "ca-sasktenders",
    name: "SaskTenders",
    jurisdiction: "Saskatchewan",
    country: "CA",
    level: "international",
    url: "https://sasktenders.ca/Content/Public/Search.aspx",
    searchUrl: "https://sasktenders.ca/Content/Public/Search.aspx",
    domain: "sasktenders.ca",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "catalog_only",
    notes: "Official Saskatchewan public tender search portal.",
  },
  {
    id: "ca-civicinfo-bc",
    name: "CivicInfo BC Bid Opportunities",
    jurisdiction: "British Columbia Local Governments",
    country: "CA",
    level: "international",
    url: "https://www.civicinfo.bc.ca/bids",
    searchUrl: "https://www.civicinfo.bc.ca/bids",
    domain: "civicinfo.bc.ca",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "catalog_only",
    notes:
      "Public procurement opportunity directory for British Columbia local governments and public-sector organizations.",
  },
  {
    id: "ca-city-of-toronto",
    name: "City of Toronto Bids and Tenders",
    jurisdiction: "Toronto, Ontario",
    country: "CA",
    level: "international",
    url: "https://www.toronto.ca/business-economy/doing-business-with-the-city/searching-bidding-on-city-contracts/",
    searchUrl:
      "https://www.toronto.ca/business-economy/doing-business-with-the-city/searching-bidding-on-city-contracts/",
    domain: "toronto.ca",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "catalog_only",
    notes:
      "Official City of Toronto procurement entry point for current solicitations and supplier bidding resources.",
  },
  {
    id: "ca-alberta-purchasing",
    name: "Alberta Purchasing Connection",
    jurisdiction: "Alberta",
    country: "CA",
    level: "international",
    url: "https://purchasing.alberta.ca/",
    searchUrl: "https://purchasing.alberta.ca/",
    domain: "purchasing.alberta.ca",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes:
      "Official Alberta public-sector purchasing and tender opportunity portal.",
  },
  {
    id: "ca-ontario-tenders",
    name: "Ontario Tenders Portal",
    jurisdiction: "Ontario",
    country: "CA",
    level: "international",
    url: "https://ontariotenders.app.jaggaer.com/esop/nac-host/public/web/login.html",
    searchUrl:
      "https://ontariotenders.app.jaggaer.com/esop/nac-host/public/web/login.html",
    domain: "ontariotenders.app.jaggaer.com",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes:
      "Official Ontario Tenders Portal public entry point; supplier registration is available for bid participation.",
  },
  {
    id: "ca-nova-scotia-procurement",
    name: "Nova Scotia Procurement Portal",
    jurisdiction: "Nova Scotia",
    country: "CA",
    level: "international",
    url: "https://procurement-portal.novascotia.ca/",
    searchUrl: "https://procurement-portal.novascotia.ca/",
    domain: "procurement-portal.novascotia.ca",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes:
      "Official Nova Scotia procurement portal for public tender opportunities.",
  },
  {
    id: "uk-find-a-tender",
    name: "UK Find a Tender",
    jurisdiction: "United Kingdom",
    country: "GB",
    level: "international",
    url: "https://www.find-tender.service.gov.uk/",
    searchUrl: "https://www.find-tender.service.gov.uk/Search",
    domain: "find-tender.service.gov.uk",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "catalog_only",
    notes:
      "Official UK service for higher-value public procurement notices and searchable tender data.",
  },
  {
    id: "uk-public-contracts-scotland",
    name: "Public Contracts Scotland",
    jurisdiction: "Scotland",
    country: "GB",
    level: "international",
    url: "https://www.publiccontractsscotland.gov.uk/",
    searchUrl:
      "https://www.publiccontractsscotland.gov.uk/search/search_mainpage.aspx",
    domain: "publiccontractsscotland.gov.uk",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "catalog_only",
    notes: "Official Scottish public-sector contract opportunity portal.",
  },
  {
    id: "uk-sell2wales",
    name: "Sell2Wales",
    jurisdiction: "Wales",
    country: "GB",
    level: "international",
    url: "https://www.sell2wales.gov.wales/",
    searchUrl: "https://www.sell2wales.gov.wales/search/search_mainpage.aspx",
    domain: "sell2wales.gov.wales",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "catalog_only",
    notes: "Official Welsh public procurement opportunity and supplier portal.",
  },
  {
    id: "uk-etendersni",
    name: "eTendersNI",
    jurisdiction: "Northern Ireland",
    country: "GB",
    level: "international",
    url: "https://etendersni.gov.uk/epps/home.do",
    searchUrl: "https://etendersni.gov.uk/epps/home.do",
    domain: "etendersni.gov.uk",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "catalog_only",
    notes: "Official Northern Ireland public-sector e-tendering portal.",
  },
  {
    id: "eu-ted",
    name: "Tenders Electronic Daily (TED)",
    jurisdiction: "European Union",
    country: "EU",
    level: "international",
    url: "https://ted.europa.eu/",
    searchUrl: "https://ted.europa.eu/en/search/result",
    domain: "ted.europa.eu",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 1,
    parserStatus: "catalog_only",
    notes:
      "Official EU supplement to the Official Journal for public procurement notices.",
  },
  {
    id: "ie-etenders",
    name: "Ireland eTenders",
    jurisdiction: "Ireland",
    country: "IE",
    level: "international",
    url: "https://www.etenders.gov.ie/epps/home.do",
    searchUrl: "https://www.etenders.gov.ie/epps/home.do",
    domain: "etenders.gov.ie",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes:
      "Official Irish national tendering website for public-sector opportunities.",
  },
  {
    id: "fr-place",
    name: "France PLACE",
    jurisdiction: "France",
    country: "FR",
    level: "international",
    url: "https://www.marches-publics.gouv.fr/",
    searchUrl: "https://www.marches-publics.gouv.fr/",
    domain: "marches-publics.gouv.fr",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes: "Official French State public procurement platform (PLACE).",
  },
  {
    id: "de-evergabe",
    name: "Germany e-Vergabe",
    jurisdiction: "Germany",
    country: "DE",
    level: "international",
    url: "https://www.evergabe-online.de/",
    searchUrl: "https://www.evergabe-online.de/search.html?type=procedure",
    domain: "evergabe-online.de",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes: "Official German federal e-procurement search portal.",
  },
  {
    id: "nl-tenderned",
    name: "TenderNed",
    jurisdiction: "Netherlands",
    country: "NL",
    level: "international",
    url: "https://www.tenderned.nl/",
    searchUrl: "https://www.tenderned.nl/aankondigingen/overzicht",
    domain: "tenderned.nl",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes: "Official Dutch public procurement announcement platform.",
  },
  {
    id: "es-placsp",
    name: "Spain Public Sector Contracting Platform",
    jurisdiction: "Spain",
    country: "ES",
    level: "international",
    url: "https://contrataciondelestado.es/",
    searchUrl: "https://contrataciondelestado.es/wps/portal/plataforma",
    domain: "contrataciondelestado.es",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes:
      "Official Spanish public-sector contracting and tender search platform.",
  },
  {
    id: "pt-base",
    name: "Portugal BASE",
    jurisdiction: "Portugal",
    country: "PT",
    level: "international",
    url: "https://www.base.gov.pt/Base4/en/",
    searchUrl: "https://www.base.gov.pt/Base4/en/",
    domain: "base.gov.pt",
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes:
      "Official Portuguese public contracts and procurement announcements portal.",
  },
  {
    id: "be-eprocurement",
    name: "Belgium e-Procurement",
    jurisdiction: "Belgium",
    country: "BE",
    level: "international",
    url: "https://www.publicprocurement.be/",
    searchUrl: "https://www.publicprocurement.be/",
    domain: "publicprocurement.be",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes: "Official Belgian federal e-Procurement entry point.",
  },
  {
    id: "ch-simap",
    name: "SIMAP Switzerland",
    jurisdiction: "Switzerland",
    country: "CH",
    level: "international",
    url: "https://www.simap.ch/",
    searchUrl: "https://www.simap.ch/",
    domain: "simap.ch",
    accessMode: "portal",
    requiresKey: false,
    requiresLogin: false,
    tier: 2,
    parserStatus: "catalog_only",
    notes: "Official Swiss public procurement publication and tender platform.",
  },
];

export const FEATURED_US_PORTAL_IDS = [
  "ma-commbuys",
  "ca-los-angeles-ramp",
  "ny-city-of-new-york",
  "wa-webs",
  "pa-emarketplace",
  "nv-epro",
] as const;

export const INTERNATIONAL_PORTAL_GROUPS = [
  {
    id: "canada",
    title: "Canada",
    portalIds: [
      "ca-canadabuys",
      "ca-seao-quebec",
      "ca-sasktenders",
      "ca-civicinfo-bc",
      "ca-city-of-toronto",
      "ca-alberta-purchasing",
      "ca-ontario-tenders",
      "ca-nova-scotia-procurement",
    ],
  },
  {
    id: "united_kingdom",
    title: "United Kingdom",
    portalIds: [
      "uk-contracts-finder",
      "uk-find-a-tender",
      "uk-public-contracts-scotland",
      "uk-sell2wales",
      "uk-etendersni",
    ],
  },
  {
    id: "europe",
    title: "Europe",
    portalIds: [
      "eu-ted",
      "ie-etenders",
      "fr-place",
      "de-evergabe",
      "nl-tenderned",
      "es-placsp",
      "pt-base",
      "be-eprocurement",
      "ch-simap",
    ],
  },
  {
    id: "multilateral",
    title: "Multilateral",
    portalIds: ["worldbank-procurement"],
  },
] as const;

export type ProcurementPortalDirectorySource = Pick<
  DirectRfpPortal,
  | "id"
  | "name"
  | "jurisdiction"
  | "country"
  | "level"
  | "url"
  | "searchUrl"
  | "accessMode"
  | "requiresLogin"
  | "parserStatus"
  | "notes"
> & {
  occumedFit?: string;
};

function selectSources<T extends ProcurementPortalDirectorySource>(
  portalsById: Map<string, T>,
  ids: readonly string[],
): T[] {
  return ids.flatMap((id) => {
    const source = portalsById.get(id);
    return source ? [source] : [];
  });
}

export function buildProcurementPortalDirectory<
  T extends ProcurementPortalDirectorySource,
>(portals: readonly T[]) {
  const portalsById = new Map(portals.map((portal) => [portal.id, portal]));
  return {
    unitedStates: {
      id: "united_states",
      title: "United States Portal Directory",
      description: "Featured official state and municipal procurement systems.",
      sources: selectSources(portalsById, FEATURED_US_PORTAL_IDS),
    },
    international: {
      id: "international",
      title: "International Opportunities",
      description:
        "Official Canadian, British, European, and multilateral procurement portals.",
      groups: INTERNATIONAL_PORTAL_GROUPS.map((group) => ({
        id: group.id,
        title: group.title,
        sources: selectSources(portalsById, group.portalIds),
      })),
    },
  };
}

export type ProcurementInventorySource = ProcurementPortalDirectorySource & {
  connectorStatus:
    | "direct_api"
    | "direct_adapter"
    | "generic_extraction"
    | "serper_discovery"
    | "directory_only"
    | "stub";
};

const INVENTORY_GROUPS = [
  {
    id: "direct",
    title: "Direct APIs & Dedicated Adapters",
    description:
      "Source-specific collection through an official API or portal adapter.",
    statuses: ["direct_api", "direct_adapter"],
  },
  {
    id: "generic",
    title: "Generic Public-Page Collection",
    description:
      "Bounded extraction from eligible official public listing pages; not a dedicated adapter.",
    statuses: ["generic_extraction"],
  },
  {
    id: "discovery",
    title: "Search / Discovery Sources",
    description:
      "Official domains searched through discovery tooling; source pages still require verification.",
    statuses: ["serper_discovery"],
  },
  {
    id: "directory",
    title: "Directory / Not Connected",
    description: "Known official portal links without automated collection.",
    statuses: ["directory_only", "stub"],
  },
] as const;

export function buildProcurementPortalInventory<
  T extends ProcurementInventorySource,
>(sources: readonly T[]) {
  return {
    total: sources.length,
    groups: INVENTORY_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      sources: sources.filter((source) =>
        (group.statuses as readonly string[]).includes(source.connectorStatus),
      ),
    })),
  };
}
