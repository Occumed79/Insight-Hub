import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DIRECT_RFP_PORTALS } from "../directRfpPortals";
import {
  CATALOGUE_STATIC_OFFICIAL_PORTAL_IDS,
  CATALOGUE_STATIC_OFFICIAL_TENANTS,
  catalogueStaticOfficialAggregateProvider,
  catalogueStaticOfficialProviders,
} from "../catalogueStaticOfficialAdapters";
import {
  getRegisteredPublicPortalAdapter,
  listRegisteredPublicPortalAdapterIds,
} from "../publicPortalAdapterRegistry";

const EXPECTED_IDS = [
  "ca-alameda-county",
  "ca-inyo-county",
  "ca-port-of-los-angeles",
  "ca-san-francisco",
  "fl-miami-dade-county",
  "ny-broome-county",
  "ny-cattaraugus-county",
  "ny-clinton-county",
  "ny-delaware-county",
  "ny-greene-county",
  "or-hood-river-county",
  "or-malheur-county",
  "tn-cumberland-county",
  "tn-greene-county",
  "tn-johnson-county",
  "tn-knox-county",
  "tn-lawrence-county",
  "tn-montgomery-county",
  "tn-weakley-county",
] as const;

describe("catalogue static official adapters", () => {
  it("registers the complete first wave as explicit runtime adapters", () => {
    assert.equal(CATALOGUE_STATIC_OFFICIAL_TENANTS.length, EXPECTED_IDS.length);
    assert.deepEqual(
      [...CATALOGUE_STATIC_OFFICIAL_PORTAL_IDS].sort(),
      [...EXPECTED_IDS].sort(),
    );

    const registered = new Set(listRegisteredPublicPortalAdapterIds());
    for (const sourceId of EXPECTED_IDS) {
      assert.ok(catalogueStaticOfficialProviders[sourceId], `${sourceId} provider exists`);
      assert.ok(getRegisteredPublicPortalAdapter(sourceId), `${sourceId} is runnable`);
      assert.ok(registered.has(sourceId), `${sourceId} is listed by the adapter registry`);
    }
  });

  it("only registers source IDs that exist in the procurement catalogue", () => {
    const catalogueIds = new Set(DIRECT_RFP_PORTALS.map((portal) => portal.id));
    for (const sourceId of EXPECTED_IDS) {
      assert.ok(catalogueIds.has(sourceId), `${sourceId} exists in DIRECT_RFP_PORTALS`);
    }
  });

  it("exposes an executable aggregate provider for Fetch Intelligence", async () => {
    assert.equal(await catalogueStaticOfficialAggregateProvider.isConfigured(), true);
    const status = await catalogueStaticOfficialAggregateProvider.getStatus();
    assert.equal(status.configured, true);
    assert.equal(status.name, "publicPortalProviders");
  });
});
