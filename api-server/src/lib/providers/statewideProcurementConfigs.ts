import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export const STATEWIDE_PLATFORM_FAMILIES = [
  "state_html",
  "cgi_advantage",
  "periscope_bso",
  "peoplesoft",
  "jaggaer_sciquest",
  "webprocure_ivalua",
  "bonfire_euna",
  "public_purchase",
  "custom_portal",
] as const;

export type StatewidePlatformFamily = (typeof STATEWIDE_PLATFORM_FAMILIES)[number];

export interface StatewidePortalConfig {
  portalId: string;
  buyerName: string;
  state: string;
  platform: string;
  platformFamily: StatewidePlatformFamily;
  listingUrl: string;
  alternateListingUrls?: readonly string[];
  origin: string;
  allowedOrigins?: readonly string[];
  sourceBadge: string;
  discoveryLinkPatterns?: readonly string[];
  interactiveAccessReason?: string;
  requestTimeoutMs?: number;
  maxRetries?: number;
  maxPages?: number;
}

const state = (
  portalId: string,
  buyerName: string,
  stateCode: string,
  platform: string,
  platformFamily: StatewidePlatformFamily,
  listingUrl: string,
  sourceBadge: string,
  options: Pick<StatewidePortalConfig, "alternateListingUrls" | "allowedOrigins" | "discoveryLinkPatterns" | "interactiveAccessReason" | "requestTimeoutMs" | "maxRetries" | "maxPages"> = {},
): StatewidePortalConfig => {
  const parsed = new URL(listingUrl);
  return {
    portalId,
    buyerName,
    state: stateCode,
    platform,
    platformFamily,
    listingUrl,
    origin: parsed.origin,
    sourceBadge,
    ...options,
  };
};

export const STATEWIDE_PORTAL_CONFIGS: readonly StatewidePortalConfig[] = [
  state("fl-vbs", "State of Florida", "FL", "Florida Vendor Information Portal / MyFloridaMarketPlace", "custom_portal", "https://vendor.myfloridamarketplace.com/search/bids", "Florida Vendor Information Portal", {
    alternateListingUrls: ["https://www.dms.myflorida.com/business_operations/state_purchasing/office_of_supplier_development_osd/vendor_resources2/current_bid_opportunities"],
    allowedOrigins: ["https://www.dms.myflorida.com"],
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    maxPages: 6,
    interactiveAccessReason: "The VIP search is an Angular application; the official DMS current-opportunities bulletin is retained as a state-owned server-rendered fallback.",
  }),
  state("ga-gpr", "State of Georgia", "GA", "Georgia Procurement Registry", "state_html", "https://ssl.doas.state.ga.us/gpr/", "Georgia Procurement Registry", {
    alternateListingUrls: ["https://doas.ga.gov/state-purchasing/bids-and-contracts"],
    allowedOrigins: ["https://doas.ga.gov"],
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    maxPages: 6,
  }),
  state("la-lapac", "State of Louisiana", "LA", "Louisiana Procurement and Contract Network / LaPAC", "state_html", "https://wwwcfprd.doa.louisiana.gov/osp/lapac/deptbids.cfm", "Louisiana LaPAC", { alternateListingUrls: ["https://wwwcfprd.doa.louisiana.gov/osp/lapac/catbids.cfm", "https://wwwcfprd.doa.louisiana.gov/osp/lapac/srchopen.cfm"] }),
  state("me-rfps", "State of Maine", "ME", "Maine Vendor Self-Service", "cgi_advantage", "https://mevss.hostams.com/PRDVSS1X1/AltSelfService", "Maine Vendor Self-Service", {
    alternateListingUrls: ["https://www.maine.gov/dafs/bbm/procurementservices/vendors/"],
    allowedOrigins: ["https://www.maine.gov"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 6,
    interactiveAccessReason: "CGI Advantage requires a session-bound Public Access guest form submission before solicitations are exposed.",
  }),
  state("ms-magic", "State of Mississippi", "MS", "Mississippi Procurement Opportunity Search / MAGIC", "state_html", "https://www.ms.gov/dfa/contract_bid_search/Search", "Mississippi Procurement Opportunity Search"),
  state("nm-active-procurements", "State of New Mexico", "NM", "New Mexico State Purchasing Active Procurements", "state_html", "https://generalservices.state.nm.us/state-purchasing/active-itbs-and-rfps/active-procurements/", "New Mexico Active Procurements"),
  state("mi-sigma", "State of Michigan", "MI", "Michigan SIGMA Vendor Self-Service", "cgi_advantage", "https://sigma.michigan.gov/webapp/PRDVSS2X1/AltSelfService", "Michigan SIGMA VSS", {
    alternateListingUrls: ["https://sigma.michigan.gov/webapp/PRDVSS2X1/Advantage4"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 6,
  }),
  state("pa-emarketplace", "Commonwealth of Pennsylvania", "PA", "Pennsylvania eMarketplace", "state_html", "https://www.emarketplace.state.pa.us/Search.aspx", "Pennsylvania eMarketplace"),
  state("va-eva", "Commonwealth of Virginia", "VA", "Virginia eVA / CGI", "custom_portal", "https://mvendor.cgieva.com/Vendor/public/PublicSearch.jsp", "Virginia eVA Business Opportunities", {
    alternateListingUrls: ["https://mvendor.cgieva.com/Vendor/public/AllOpportunities.jsp", "https://eva.virginia.gov/i-sell-to-virginia.html"],
    allowedOrigins: ["https://eva.virginia.gov"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("oh-ohiobuys", "State of Ohio", "OH", "OhioBuys / Ivalua", "webprocure_ivalua", "https://ohiobuys.ohio.gov/page.aspx/en/rfp/request_browse_public", "OhioBuys Public Solicitations"),
  state("md-emma", "State of Maryland", "MD", "eMaryland Marketplace Advantage", "webprocure_ivalua", "https://emma.maryland.gov/page.aspx/en/rfp/request_browse_public", "eMaryland Marketplace Advantage"),
  state("nc-evp", "State of North Carolina", "NC", "North Carolina electronic Vendor Portal", "webprocure_ivalua", "https://evp.nc.gov/solicitations/", "North Carolina eVP"),

  state("al-state-procurement", "State of Alabama", "AL", "Alabama STAARS Vendor Self-Service", "cgi_advantage", "https://procurement.staars.alabama.gov/PRDVSS1X1/AltSelfService", "Alabama State Procurement", {
    alternateListingUrls: ["https://rfp.alabama.gov/PublicView.aspx"],
    allowedOrigins: ["https://rfp.alabama.gov"],
  }),
  state("ak-iris-vss", "State of Alaska", "AK", "Alaska IRIS Vendor Self-Service", "cgi_advantage", "https://iris-vss.alaska.gov/PRDVSS1X1/Advantage4", "Alaska IRIS VSS", {
    alternateListingUrls: ["https://aws.state.ak.us/OnlinePublicNotices/default.aspx"],
    allowedOrigins: ["https://aws.state.ak.us"],
  }),
  state("az-app", "State of Arizona", "AZ", "Arizona Procurement Portal", "webprocure_ivalua", "https://app.az.gov/page.aspx/en/rfp/request_browse_public", "Arizona Procurement Portal"),
  state("ar-arbuy", "State of Arkansas", "AR", "ARBuy / Periscope S2G", "periscope_bso", "https://arbuy.arkansas.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true", "Arkansas ARBuy", {
    alternateListingUrls: ["https://www.arkansas.gov/tss/procurement/bids/index.php"],
    allowedOrigins: ["https://www.arkansas.gov"],
  }),
  state("co-vss", "State of Colorado", "CO", "Colorado Vendor Self-Service", "cgi_advantage", "https://codpa-vss.cloud.cgifederal.com/webapp/PRDVSS2X1/AltSelfService", "Colorado VSS", {
    alternateListingUrls: ["https://co.colorado.gov/bid-work-state"],
    allowedOrigins: ["https://co.colorado.gov"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 6,
  }),
  state("ct-ctsource", "State of Connecticut", "CT", "CTsource / WebProcure", "webprocure_ivalua", "https://portal.ct.gov/DAS/CTSource/BidBoard", "Connecticut CTsource Bid Board", {
    alternateListingUrls: ["https://webprocure.proactiscloud.com/wp-web-public/#/bidboard"],
    allowedOrigins: ["https://webprocure.proactiscloud.com"],
  }),
  state("de-mymarketplace", "State of Delaware", "DE", "Delaware Open Bids / MyMarketplace", "custom_portal", "https://data.delaware.gov/resource/2hnj-zwix.json?$limit=5000", "Delaware Open Bids", {
    alternateListingUrls: ["https://mmp.delaware.gov/Bids"],
    allowedOrigins: ["https://mmp.delaware.gov"],
  }),
  state("hi-hiepro", "State of Hawaii", "HI", "Hawaii Awards & Notices Data System / HIePRO", "state_html", "https://hands.ehawaii.gov/hands/opportunities", "Hawaii HANDS Opportunities", {
    alternateListingUrls: ["https://hiepro.ehawaii.gov/sav-search.html"],
    allowedOrigins: ["https://hiepro.ehawaii.gov"],
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("id-purchasing", "State of Idaho", "ID", "Idaho Division of Purchasing / IPRO", "state_html", "https://purchasing.idaho.gov/open-and-future-solicitations/", "Idaho Open and Future Solicitations", {
    alternateListingUrls: ["https://purchasing.idaho.gov/vendor-resources/"],
  }),
  state("il-bidbuy", "State of Illinois", "IL", "Illinois BidBuy / Periscope S2G", "periscope_bso", "https://www.bidbuy.illinois.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true", "Illinois BidBuy", {
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("in-idoa", "State of Indiana", "IN", "Indiana IDOA Current Business Opportunities", "state_html", "https://www.in.gov/idoa/procurement/current-business-opportunities/", "Indiana Current Business Opportunities"),
  state("ks-esupplier", "State of Kansas", "KS", "Kansas eSupplier / PeopleSoft", "peoplesoft", "https://supplier.sok.ks.gov/psc/sokfsprdsup_1/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?FolderPath=PORTAL_ROOT_OBJECT.NUI_STRUCTURE_CONTENT.PORTAL_GROUPLETS.EP_COSP_PUBLIC_HOME_FL.EP_SUP_PUBLIC_BID_OPPRTNITY_FL&IgnoreParamTempl=FolderPath%2CIsFolder&IsFolder=false&PAGE=SCP_PUB_BIDLIST_FL&page=SCP_PUB_BIDLIST_FL", "Kansas eSupplier Bid Opportunities", {
    alternateListingUrls: ["https://supplier.sok.ks.gov/psc/sokfsprdsup/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("ky-vss", "Commonwealth of Kentucky", "KY", "Kentucky eMARS Vendor Self-Service", "cgi_advantage", "https://vss.ky.gov/vssprod-ext/Advantage4", "Kentucky eMARS VSS", {
    alternateListingUrls: ["https://vss.ky.gov/vssprod-ext/AltSelfService"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 6,
  }),
  state("mn-swift", "State of Minnesota", "MN", "Minnesota SWIFT Supplier Portal", "peoplesoft", "https://guest.supplier.systems.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL", "Minnesota SWIFT Public Events", {
    alternateListingUrls: ["https://guest.supplier.systems.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
    interactiveAccessReason: "The official public SWIFT guest route is protected by a Radware/Perfdrive hCaptcha challenge for automated network traffic.",
  }),
  state("mo-missouribuys", "State of Missouri", "MO", "MissouriBUYS powered by MOVERS", "state_html", "https://missouribuys.mo.gov/bid-board/movers", "MissouriBUYS Bid Board", {
    alternateListingUrls: ["https://missouribuys.mo.gov/bid-board"],
  }),
  state("mt-emacs", "State of Montana", "MT", "Montana eMACS / Jaggaer SciQuest", "jaggaer_sciquest", "https://bids.sciquest.com/apps/Router/PublicEvent?CustomerOrg=StateOfMontana", "Montana eMACS Public Events"),
  state("ne-state-purchasing", "State of Nebraska", "NE", "Nebraska Materiel Division", "state_html", "https://das.nebraska.gov/materiel/bid-opportunities.html", "Nebraska State Purchasing Bid Opportunities"),
  state("nh-bids", "State of New Hampshire", "NH", "New Hampshire Bureau of Purchase and Property", "state_html", "https://das.nh.gov/purchasing/vendorresources.aspx", "New Hampshire Bids and Contracts", {
    alternateListingUrls: ["https://das.nh.gov/purchasing/vendorresources.asp", "https://www.das.nh.gov/purchasing/"],
    allowedOrigins: ["https://www.das.nh.gov"],
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("nd-spo", "State of North Dakota", "ND", "North Dakota State Procurement / NDBuys", "state_html", "https://apps.nd.gov/csd/spo/services/bidder/listCurrentSolicitations.htm", "North Dakota Current Solicitations", {
    alternateListingUrls: ["https://internal.ndbuys.nd.gov/page.aspx/en/rfp/request_browse_public", "https://public.ndbuys.nd.gov/"],
    allowedOrigins: ["https://www.apps.nd.gov", "https://internal.ndbuys.nd.gov", "https://public.ndbuys.nd.gov"],
  }),
  state("ok-omes", "State of Oklahoma", "OK", "Oklahoma OMES / PeopleSoft", "peoplesoft", "https://financials.ok.gov/psc/SOKLFP1DS/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL", "Oklahoma OMES Solicitations", {
    alternateListingUrls: ["https://oklahoma.gov/omes/divisions/central-purchasing/solicitations.html"],
    allowedOrigins: ["https://oklahoma.gov"],
  }),
  state("or-oregonbuys", "State of Oregon", "OR", "OregonBuys / Periscope S2G", "periscope_bso", "https://oregonbuys.gov/bso/view/search/external/advancedSearchBid.xhtml?openBids=true", "OregonBuys", {
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("ri-bids", "State of Rhode Island", "RI", "Ocean State Procures / WebProcure", "webprocure_ivalua", "https://ridop.ri.gov/vendor-resources/all-solicitations", "Rhode Island OSP Bid Board", {
    alternateListingUrls: ["https://ridop.ri.gov/vendors/bidding-opportunities", "https://webprocure.proactiscloud.com/wp-web-public/#/bidboard"],
    allowedOrigins: ["https://webprocure.proactiscloud.com"],
  }),
  state("sc-sceis", "State of South Carolina", "SC", "South Carolina SCEIS Solicitation Search", "custom_portal", "https://apps.sceis.sc.gov/SCSolicitationWeb/solicitationSearch.do", "South Carolina SCEIS", {
    alternateListingUrls: ["https://www.procurement.sc.gov/doing-biz/bid-ops"],
    allowedOrigins: ["https://www.procurement.sc.gov"],
  }),
  state("sd-solicitations", "State of South Dakota", "SD", "South Dakota Central Bid Exchange / ESM Solutions", "custom_portal", "https://postingboard.esmsolutions.com/3444a404-3818-494f-84c5-2a850acd7779/events", "South Dakota Central Bid Exchange", {
    alternateListingUrls: ["https://www.sd.gov/bhra?id=kb_article_view&sysparm_article=KB0044779", "https://boa.sd.gov/central-services/procurement-management/"],
    allowedOrigins: ["https://www.sd.gov", "https://boa.sd.gov"],
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("tn-edison", "State of Tennessee", "TN", "Tennessee Edison / PeopleSoft", "peoplesoft", "https://hub.edison.tn.gov/psc/fsprd/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL", "Tennessee Edison Bid Opportunities", {
    alternateListingUrls: [
      "https://www.tn.gov/generalservices/procurement/central-procurement-office--cpo-/supplier-information/invitations-to-bid--itb-.html",
      "https://www.tn.gov/generalservices/procurement/central-procurement-office--cpo-/supplier-information/request-for-proposals--rfp--opportunities1.html",
    ],
    allowedOrigins: ["https://www.tn.gov"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("ut-purchasing", "State of Utah", "UT", "Utah Public Procurement Place / Bonfire", "bonfire_euna", "https://utah.bonfirehub.com/portal/?tab=openOpportunities", "Utah Public Procurement Place"),
  state("vt-bids", "State of Vermont", "VT", "Vermont Business Registry Bid System", "custom_portal", "https://www.vermontbusinessregistry.com/BidSystem/", "Vermont Bid System", {
    alternateListingUrls: ["https://www.vermontbusinessregistry.com/"],
  }),
  state("wa-webs", "State of Washington", "WA", "Washington Enterprise Bid System", "custom_portal", "https://pr-webs-vendor.des.wa.gov/BidCalendar.aspx", "Washington WEBS Bid Calendar", {
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("wv-oasis", "State of West Virginia", "WV", "West Virginia wvOASIS Vendor Self-Service", "cgi_advantage", "https://prd311.wvoasis.gov/PRDVSS1X1/AltSelfService", "West Virginia wvOASIS", {
    alternateListingUrls: ["https://prd311.wvoasis.gov/PRDVSS1X1/Advantage4", "https://purchasing.wv.gov/vendor/Pages/default.aspx", "https://dep-auth.wv.gov/bto/IHP/Pages/default.aspx"],
    allowedOrigins: ["https://purchasing.wv.gov", "https://dep-auth.wv.gov"],
    requestTimeoutMs: 60_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("wi-vendornet", "State of Wisconsin", "WI", "Wisconsin eSupplier / VendorNet", "peoplesoft", "https://esupplier.wi.gov/psc/esupplier_4/SUPPLIER/ERP/c/WI_SS_SELF_SERVICE.WI_SS_BIDDER_BIDS.GBL?page=WI_SS_BIDDER_BIDS", "Wisconsin eSupplier Search Solicitations", {
    alternateListingUrls: [
      "https://esupplier.wi.gov/psc/esupplier_3/SUPPLIER/ERP/c/WI_SS_SELF_SERVICE.WI_SS_BIDDER_BIDS.GBL?page=WI_SS_BIDDER_BIDS",
      "https://esupplier.wi.gov/psc/esupplier_5/SUPPLIER/ERP/c/WI_SS_SELF_SERVICE.WI_SS_PGLT_CURSOL.GBL",
    ],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
  }),
  state("wy-state-purchasing", "State of Wyoming", "WY", "Wyoming State Purchasing / Public Purchase", "public_purchase", "https://www.publicpurchase.com/gems/wyominggsd%2Cwy/buyer/public/publicInfo", "Wyoming State Purchasing", {
    alternateListingUrls: ["https://ai.wyo.gov/divisions/general-services/purchasing/bid-opportunities"],
    allowedOrigins: ["https://ai.wyo.gov"],
  }),
] as const;

export const STATEWIDE_PROCUREMENT_PORTAL_IDS = new Set(STATEWIDE_PORTAL_CONFIGS.map((source) => source.portalId));

export function statewideAllowedOrigins(config: StatewidePortalConfig): ReadonlySet<string> {
  return new Set([config.origin, ...(config.allowedOrigins ?? [])].map((value) => new URL(value).origin));
}

export function allowedStatewideUrl(config: StatewidePortalConfig, value: string, base = config.listingUrl): string | undefined {
  try {
    const parsed = new URL(value, base);
    if (!/^https?:$/.test(parsed.protocol) || !statewideAllowedOrigins(config).has(parsed.origin)) return undefined;
    if (!parsed.hash.startsWith("#/")) parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

export const STATEWIDE_PROCUREMENT_SOURCES: PublicPortalSource[] = STATEWIDE_PORTAL_CONFIGS.map((source) => ({
  id: source.portalId,
  agencyName: source.buyerName,
  agencyType: "state",
  state: source.state,
  sourceUrl: source.listingUrl,
  searchUrl: source.listingUrl,
  domain: safeHostname(source.listingUrl),
  portalPlatform: source.platform,
  sourceLevel: "state",
  level: "state",
  accessMode: "public_html",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: `Dedicated public listing/detail adapter for ${source.sourceBadge}; platformFamily=${source.platformFamily}.`,
}));
