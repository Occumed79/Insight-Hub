import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DELETED_PORTAL_IDS } from "../deletedPortalPolicy";
import {
  OPENGOV_PORTAL_IDS,
  OPENGOV_TENANT_BY_PORTAL_ID,
} from "../openGov";
import { OPENGOV_COUNTY_EXTENSIONS } from "../openGovCountyExtensions";
import { PLANETBIDS_WAF_BLOCKED_PORTAL_IDS } from "../planetBidsAccessPolicy";
import { getRegisteredPublicPortalAdapter } from "../publicPortalAdapterRegistry";
import { PUBLIC_PORTAL_SOURCES } from "../publicPortalProviders/catalog";

const EXPECTED_TENANTS = new Map([
  ["ca-solano-county", "solanocounty"],
  ["ca-santa-cruz-county", "santacruzcounty"],
  ["ca-san-mateo-county", "smcgov"],
  ["ca-orange-county", "ocgov"],
  ["ca-inyo-county", "countyofinyoca"],
]);

describe("OpenGov county tenant extensions", () => {
  it("retains tenant metadata for audit while deleting failed runtime sources", () => {
    assert.equal(OPENGOV_COUNTY_EXTENSIONS.length, EXPECTED_TENANTS.size);
    const catalogIds = new Set(PUBLIC_PORTAL_SOURCES.map((source) => source.id));

    for (const [portalId, tenantSlug] of EXPECTED_TENANTS) {
      assert.equal(OPENGOV_PORTAL_IDS.has(portalId), true, portalId);
      assert.equal(OPENGOV_TENANT_BY_PORTAL_ID.get(portalId)?.tenantSlug, tenantSlug);
      assert.equal(DELETED_PORTAL_IDS.has(portalId), true, portalId);
      assert.equal(catalogIds.has(portalId), false, portalId);
      assert.equal(getRegisteredPublicPortalAdapter(portalId), undefined, portalId);
    }
  });

  it("deletes Public Purchase sources without authorized public access", () => {
    const catalogIds = new Set(PUBLIC_PORTAL_SOURCES.map((source) => source.id));
    for (const portalId of ["wy-state-purchasing", "ca-calaveras-county"]) {
      assert.equal(DELETED_PORTAL_IDS.has(portalId), true, portalId);
      assert.equal(catalogIds.has(portalId), false, portalId);
      assert.equal(getRegisteredPublicPortalAdapter(portalId), undefined, portalId);
    }
  });

  it("deletes AWS WAF-blocked PlanetBids buyers", () => {
    const catalogIds = new Set(PUBLIC_PORTAL_SOURCES.map((source) => source.id));

    for (const portalId of PLANETBIDS_WAF_BLOCKED_PORTAL_IDS) {
      assert.equal(DELETED_PORTAL_IDS.has(portalId), true, portalId);
      assert.equal(catalogIds.has(portalId), false, portalId);
      assert.equal(getRegisteredPublicPortalAdapter(portalId), undefined, portalId);
    }
  });
});
