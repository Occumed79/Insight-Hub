import type { DataSourceProvider } from "./types";
import type { PublicPortalSource } from "./publicPortalProviders/catalog";
import {
  CgiAdvantagePublicProvider,
  type CgiAdvantagePublicTenant,
} from "./cgiAdvantagePublic";

function sourceFor(tenant: CgiAdvantagePublicTenant): PublicPortalSource {
  return {
    id: tenant.portalId,
    agencyName: tenant.buyerName,
    agencyType: "state",
    state: tenant.state,
    sourceUrl: tenant.listingUrl,
    searchUrl: tenant.listingUrl,
    domain: new URL(tenant.listingUrl).hostname,
    portalPlatform: "CGI Advantage Vendor Self Service",
    sourceLevel: "state",
    level: "state",
    accessMode: "api",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
    notes: "Shared CGI Advantage public guest-session solicitation adapter.",
  };
}

export const CGI_ADVANTAGE_STATE_TENANTS: readonly CgiAdvantagePublicTenant[] = [
  {
    portalId: "ak-iris-vss",
    buyerName: "State of Alaska",
    state: "AK",
    listingUrl: "https://iris-vss.alaska.gov/PRDVSS1X1/Advantage4",
    sourceBadge: "Alaska IRIS VSS Published Solicitations",
  },
  {
    portalId: "co-vss",
    buyerName: "State of Colorado",
    state: "CO",
    listingUrl: "https://prd.co.cgiadvantage.com/PRDVSS1X1/Advantage4",
    sourceBadge: "ColoradoVSS Published Solicitations",
  },
  {
    portalId: "wv-oasis",
    buyerName: "State of West Virginia",
    state: "WV",
    listingUrl: "https://prd311.wvoasis.gov/PRDVSS1X1/Advantage4",
    sourceBadge: "West Virginia wvOASIS Published Solicitations",
  },
] as const;

export const CGI_ADVANTAGE_STATE_SOURCES: PublicPortalSource[] = CGI_ADVANTAGE_STATE_TENANTS.map(sourceFor);
export const cgiAdvantageStateProviders: Record<string, DataSourceProvider> = Object.fromEntries(
  CGI_ADVANTAGE_STATE_TENANTS.map((tenant) => [tenant.portalId, new CgiAdvantagePublicProvider(tenant)]),
);
