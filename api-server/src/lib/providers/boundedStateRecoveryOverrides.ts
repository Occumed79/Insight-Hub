import type {
  DataSourceProvider,
  ProviderFetchResult,
  ProviderStatus,
} from "./types";
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

const VERMONT_URL =
  "https://www.vermontbusinessregistry.com/BidSearch.aspx?type=5";
const VERMONT_MANUAL_REASON =
  "The Vermont Business Registry displays current bids to interactive browsers, but repeated bounded server-side requests did not expose stable parseable bid rows. The official link is retained for manual browser access and removed from automated collection.";

class ManualAccessProvider implements DataSourceProvider {
  readonly name = "publicPortalProviders" as const;

  constructor(readonly reason: string) {}

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetch(): Promise<ProviderFetchResult> {
    return { records: [], total: 0, errors: [] };
  }

  async getStatus(): Promise<ProviderStatus> {
    return {
      name: this.name,
      configured: true,
      healthy: true,
      errorMessage: this.reason,
      recordCount: 0,
    };
  }
}

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

const VERMONT_MANUAL_SOURCE: PublicPortalSource = {
  id: "vt-bids",
  agencyName: "State of Vermont",
  agencyType: "state",
  state: "VT",
  sourceUrl: VERMONT_URL,
  searchUrl: VERMONT_URL,
  domain: new URL(VERMONT_URL).hostname,
  portalPlatform: "Vermont Business Registry Open Bids",
  sourceLevel: "state",
  level: "state",
  accessMode: "public_html",
  scraperType: "existing_parser",
  enabled: false,
  verificationStatus: "needs_review",
  notes: VERMONT_MANUAL_REASON,
};

export const BOUNDED_STATE_RECOVERY_SOURCES: PublicPortalSource[] = [
  sourceFor(RHODE_ISLAND),
  sourceFor(WISCONSIN),
  VERMONT_MANUAL_SOURCE,
];

export const boundedStateRecoveryProviders: Record<
  string,
  DataSourceProvider
> = {
  [RHODE_ISLAND.portalId]: new StaticOfficialRecoveryProvider(RHODE_ISLAND),
  [WISCONSIN.portalId]: new StaticOfficialRecoveryProvider(WISCONSIN),
  [VERMONT_MANUAL_SOURCE.id]: new ManualAccessProvider(VERMONT_MANUAL_REASON),
};
