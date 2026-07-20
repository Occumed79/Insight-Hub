import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import {
  StatewideProcurementProvider,
  type StatewidePortalConfig,
} from "./statewideProcurementPortals";

export const NEW_HAMPSHIRE_BIDS_PORTAL_ID = "nh-bids";
export const NEW_HAMPSHIRE_BIDS_LISTING_URL =
  "https://apps.das.nh.gov/bidscontracts/bids.aspx";

export const NEW_HAMPSHIRE_BIDS_SOURCE: PublicPortalSource = {
  id: NEW_HAMPSHIRE_BIDS_PORTAL_ID,
  agencyName: "State of New Hampshire",
  agencyType: "state",
  state: "NH",
  sourceUrl: NEW_HAMPSHIRE_BIDS_LISTING_URL,
  searchUrl: NEW_HAMPSHIRE_BIDS_LISTING_URL,
  domain: "apps.das.nh.gov",
  portalPlatform: "New Hampshire Statewide Bids and Proposals",
  sourceLevel: "state",
  level: "state",
  accessMode: "public_html",
  scraperType: "existing_parser",
  enabled: true,
  verificationStatus: "verified",
  notes: "Dedicated adapter for New Hampshire's official Statewide Bids and Proposals application.",
};

export const NEW_HAMPSHIRE_BIDS_CONFIG: StatewidePortalConfig = {
  portalId: NEW_HAMPSHIRE_BIDS_PORTAL_ID,
  buyerName: "State of New Hampshire",
  state: "NH",
  platform: "New Hampshire Statewide Bids and Proposals",
  platformFamily: "state_html",
  listingUrl: NEW_HAMPSHIRE_BIDS_LISTING_URL,
  alternateListingUrls: [
    "https://apps.das.nh.gov/bidscontracts/",
  ],
  origin: "https://apps.das.nh.gov",
  sourceBadge: "New Hampshire Statewide Bids and Proposals",
  discoveryLinkPatterns: [
    "bidscontracts",
    "bid",
    "proposal",
    "rfp",
    "rfb",
  ],
  requestTimeoutMs: 30_000,
  maxRetries: 2,
  maxPages: 8,
};

export const newHampshireBidsProvider = new StatewideProcurementProvider(
  NEW_HAMPSHIRE_BIDS_CONFIG,
);
