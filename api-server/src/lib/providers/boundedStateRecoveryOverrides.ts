import type { DataSourceProvider } from "./types";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import { StaticOfficialRecoveryProvider } from "./productionSourceRecovery";

const RHODE_ISLAND = {
  portalId: "ri-bids",
  buyerName: "State of Rhode Island",
  state: "RI",
  platform: "Rhode Island VSS / RIVIP Public Bid Search",
  platformFamily: "state_html" as const,
  sourceBadge: "Rhode Island Public Bid Search",
  urls: [
    "https://purchasing.ri.gov/bidding/ExternalBidSearch.aspx",
    "https://ridop.ri.gov/vendor-resources/all-solicitations",
  ] as const,
  timeoutMs: 10_000,
};

const WISCONSIN = {
  portalId: "wi-vendornet",
  buyerName: "State of Wisconsin",
  state: "WI",
  platform: "Wisconsin VendorNet Public Bids",
  platformFamily: "state_html" as const,
  sourceBadge: "Wisconsin VendorNet Public Bids",
  urls: [
    "https://vendornet.wi.gov/Bids.aspx",
    "https://doa.wi.gov/Pages/StateEmployees/Procurement.aspx",
  ] as const,
  timeoutMs: 7_500,
};

function sourceFor(
  tenant: typeof RHODE_ISLAND | typeof WISCONSIN,
): PublicPortalSource {
  return {
    id: tenant.portalId,
    agencyName: tenant.buyerName,
    agencyType: "state",
    state: tenant.state,
    sourceUrl: tenant.urls[0],
    searchUrl: tenant.urls[0],
    domain: new URL(tenant.urls[0]).hostname,
    portalPlatform: tenant.platform,
    sourceLevel: "state",
    level: "state",
    accessMode: "public_html",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes:
      `Bounded official listing-only recovery route for ${tenant.sourceBadge}; no sequential detail or PeopleSoft fallback fan-out.`,
  };
}

export const BOUNDED_STATE_RECOVERY_SOURCES: PublicPortalSource[] = [
  sourceFor(RHODE_ISLAND),
  sourceFor(WISCONSIN),
];

export const boundedStateRecoveryProviders: Record<
  string,
  DataSourceProvider
> = {
  [RHODE_ISLAND.portalId]: new StaticOfficialRecoveryProvider(RHODE_ISLAND),
  [WISCONSIN.portalId]: new StaticOfficialRecoveryProvider(WISCONSIN),
};
