import {
  OPENGOV_PORTAL_IDS,
  OPENGOV_TENANTS,
  OPENGOV_TENANT_BY_PORTAL_ID,
  type OpenGovTenant,
} from "./openGov";

/**
 * Existing direct-portal catalog IDs whose official buyer pages now route to
 * OpenGov. Keeping these as extensions lets the shared OpenGov API adapter
 * collect them without duplicating the platform implementation.
 */
export const OPENGOV_COUNTY_EXTENSIONS: readonly OpenGovTenant[] = [
  {
    portalId: "ca-solano-county",
    tenantSlug: "solanocounty",
    buyerName: "Solano County",
    state: "CA",
    capability: "dedicated_listing_and_detail",
  },
  {
    portalId: "ca-santa-cruz-county",
    tenantSlug: "santacruzcounty",
    buyerName: "County of Santa Cruz",
    state: "CA",
    capability: "dedicated_listing_and_detail",
  },
  {
    portalId: "ca-san-mateo-county",
    tenantSlug: "smcgov",
    buyerName: "County of San Mateo",
    state: "CA",
    capability: "dedicated_listing_and_detail",
  },
  {
    portalId: "ca-orange-county",
    tenantSlug: "ocgov",
    buyerName: "County of Orange",
    state: "CA",
    capability: "dedicated_listing_and_detail",
  },
  {
    portalId: "ca-inyo-county",
    tenantSlug: "countyofinyoca",
    buyerName: "County of Inyo, CA",
    state: "CA",
    capability: "dedicated_listing_and_detail",
  },
];

let registered = false;

export function registerOpenGovCountyExtensions(): void {
  if (registered) return;
  registered = true;

  for (const tenant of OPENGOV_COUNTY_EXTENSIONS) {
    const existing = OPENGOV_TENANT_BY_PORTAL_ID.get(tenant.portalId);
    if (existing) continue;
    OPENGOV_TENANTS.push(tenant);
    OPENGOV_TENANT_BY_PORTAL_ID.set(tenant.portalId, tenant);
    OPENGOV_PORTAL_IDS.add(tenant.portalId);
  }
}
