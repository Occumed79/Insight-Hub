import {
  JaggaerSciQuestProvider,
  type JaggaerTenant,
} from "./jaggaerSciQuest";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";

export const GEORGIA_GAWORK_PORTAL_ID = "ga-gpr";
export const GEORGIA_GAWORK_LISTING_URL =
  "https://bids.sciquest.com/apps/Router/PublicEvent?CustomerOrg=Georgia";

export const GEORGIA_GAWORK_TENANT: JaggaerTenant = {
  portalId: GEORGIA_GAWORK_PORTAL_ID,
  tenantSlug: "georgia-gawork",
  customerOrg: "Georgia",
  buyerName: "State of Georgia",
  state: "GA",
  country: "US",
  listingUrl: GEORGIA_GAWORK_LISTING_URL,
  origin: "https://bids.sciquest.com",
  capability: "dedicated_listing",
};

export const GEORGIA_GAWORK_SOURCE: PublicPortalSource = {
  id: GEORGIA_GAWORK_PORTAL_ID,
  agencyName: "State of Georgia",
  agencyType: "state",
  state: "GA",
  sourceUrl: GEORGIA_GAWORK_LISTING_URL,
  searchUrl: GEORGIA_GAWORK_LISTING_URL,
  domain: "bids.sciquest.com",
  portalPlatform: "GA@WORK / JAGGAER SciQuest",
  sourceLevel: "state",
  level: "state",
  accessMode: "public_html",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated adapter for the State of Georgia GA@WORK public sourcing-event feed.",
};

export const georgiaGaworkProvider = new JaggaerSciQuestProvider([
  GEORGIA_GAWORK_TENANT,
]);
