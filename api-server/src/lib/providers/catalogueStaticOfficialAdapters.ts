import type { DataSourceProvider } from "./types";
import { StaticOfficialRecoveryProvider } from "./productionSourceRecovery";

type StaticOfficialTenant = ConstructorParameters<
  typeof StaticOfficialRecoveryProvider
>[0];

export const CATALOGUE_STATIC_OFFICIAL_TENANTS: readonly StaticOfficialTenant[] = [
  {
    portalId: "ca-alameda-county",
    buyerName: "Alameda County",
    state: "CA",
    platform: "Official county contracting opportunities",
    platformFamily: "state_html",
    sourceBadge: "Alameda County Contracting Opportunities",
    urls: [
      "https://gsa.acgov.org/do-business-with-us/contracting-opportunities/",
    ],
  },
  {
    portalId: "ca-inyo-county",
    buyerName: "Inyo County",
    state: "CA",
    platform: "Official county bid and RFP listing",
    platformFamily: "state_html",
    sourceBadge: "Inyo County Bid Requests and RFPs",
    urls: [
      "https://www.inyocounty.us/services/county-administrators-office/bid-request-rfp",
    ],
  },
  {
    portalId: "ca-port-of-los-angeles",
    buyerName: "Port of Los Angeles",
    state: "CA",
    platform: "Official port purchasing bids",
    platformFamily: "state_html",
    sourceBadge: "Port of Los Angeles Purchasing Bids",
    urls: [
      "https://portoflosangeles.org/business/contracting-opportunities/purchasing-bids",
    ],
  },
  {
    portalId: "ca-san-francisco",
    buyerName: "City and County of San Francisco",
    state: "CA",
    platform: "Official city bid opportunities",
    platformFamily: "state_html",
    sourceBadge: "San Francisco Bid Opportunities",
    urls: ["https://www.sf.gov/information--bid-opportunities"],
  },
  {
    portalId: "fl-miami-dade-county",
    buyerName: "Miami-Dade County",
    state: "FL",
    platform: "Official county current solicitations",
    platformFamily: "state_html",
    sourceBadge: "Miami-Dade Current Solicitations",
    urls: [
      "https://www.miamidade.gov/apps/ISD/stratproc/Home/CurrentSolicitations",
    ],
  },
  {
    portalId: "ny-broome-county",
    buyerName: "Broome County",
    state: "NY",
    platform: "Official county open solicitations",
    platformFamily: "state_html",
    sourceBadge: "Broome County Open Solicitations",
    urls: ["https://broomecountyny.gov/purchasing/open-solicitations"],
  },
  {
    portalId: "ny-cattaraugus-county",
    buyerName: "Cattaraugus County",
    state: "NY",
    platform: "Official county bid requests",
    platformFamily: "state_html",
    sourceBadge: "Cattaraugus County Bid Requests",
    urls: ["https://www.cattco.gov/bid-request"],
  },
  {
    portalId: "ny-clinton-county",
    buyerName: "Clinton County",
    state: "NY",
    platform: "Official county purchasing bids",
    platformFamily: "state_html",
    sourceBadge: "Clinton County Purchasing Bids",
    urls: ["https://www.clintoncountyny.gov/purchasing/bids"],
  },
  {
    portalId: "ny-delaware-county",
    buyerName: "Delaware County",
    state: "NY",
    platform: "Official county RFP notices",
    platformFamily: "state_html",
    sourceBadge: "Delaware County RFP Notices",
    urls: ["https://www.delcony.gov/blog/category/rfp/"],
  },
  {
    portalId: "ny-greene-county",
    buyerName: "Greene County",
    state: "NY",
    platform: "Official county RFP and bid notices",
    platformFamily: "state_html",
    sourceBadge: "Greene County RFP and Bid Notices",
    urls: ["https://greenecountyny.gov/category/rfp/"],
  },
  {
    portalId: "or-hood-river-county",
    buyerName: "Hood River County",
    state: "OR",
    platform: "Official county RFP and bid documents",
    platformFamily: "state_html",
    sourceBadge: "Hood River County RFP and Bid Documents",
    urls: [
      "https://www.hoodrivercounty.gov/?SEC=3F86B7A7-6605-4973-9884-C29DA41C6166",
    ],
  },
  {
    portalId: "or-malheur-county",
    buyerName: "Malheur County",
    state: "OR",
    platform: "Official county bid process",
    platformFamily: "state_html",
    sourceBadge: "Malheur County Bid Process",
    urls: ["https://www.malheurco.org/county-court/bid-process/"],
  },
  {
    portalId: "tn-cumberland-county",
    buyerName: "Cumberland County",
    state: "TN",
    platform: "Official county finance procurement notices",
    platformFamily: "state_html",
    sourceBadge: "Cumberland County Procurement Notices",
    urls: ["https://cumberlandcountytn.gov/directory/finance/"],
  },
  {
    portalId: "tn-greene-county",
    buyerName: "Greene County",
    state: "TN",
    platform: "Official county purchasing solicitations",
    platformFamily: "state_html",
    sourceBadge: "Greene County Purchasing",
    urls: ["https://www.greenecountytngov.com/purchasing/"],
  },
  {
    portalId: "tn-johnson-county",
    buyerName: "Johnson County",
    state: "TN",
    platform: "Official county purchasing opportunities",
    platformFamily: "state_html",
    sourceBadge: "Johnson County Purchasing Opportunities",
    urls: ["https://www.johnsoncountytn.gov/purchasing-department"],
  },
  {
    portalId: "tn-knox-county",
    buyerName: "Knox County",
    state: "TN",
    platform: "Official county current solicitations",
    platformFamily: "state_html",
    sourceBadge: "Knox County Current Solicitations",
    urls: ["https://www.knoxcounty.org/apps/solicitations/solicitations.php"],
  },
  {
    portalId: "tn-lawrence-county",
    buyerName: "Lawrence County",
    state: "TN",
    platform: "Official county procurement notices",
    platformFamily: "state_html",
    sourceBadge: "Lawrence County Procurement Notices",
    urls: ["https://lawrencecountytn.gov/news/"],
  },
  {
    portalId: "tn-montgomery-county",
    buyerName: "Montgomery County",
    state: "TN",
    platform: "Official county current bids",
    platformFamily: "state_html",
    sourceBadge: "Montgomery County Current Bids",
    urls: ["https://mcgtn.org/purchasing/bids"],
  },
  {
    portalId: "tn-weakley-county",
    buyerName: "Weakley County",
    state: "TN",
    platform: "Official county bids and purchasing",
    platformFamily: "state_html",
    sourceBadge: "Weakley County Bids and Purchasing",
    urls: ["https://www.weakleycountytn.gov/bids--purchasing.html"],
  },
];

export const CATALOGUE_STATIC_OFFICIAL_PORTAL_IDS = new Set(
  CATALOGUE_STATIC_OFFICIAL_TENANTS.map((tenant) => tenant.portalId),
);

export const catalogueStaticOfficialProviders: Readonly<
  Record<string, DataSourceProvider>
> = Object.fromEntries(
  CATALOGUE_STATIC_OFFICIAL_TENANTS.map((tenant) => [
    tenant.portalId,
    new StaticOfficialRecoveryProvider(tenant),
  ]),
);
