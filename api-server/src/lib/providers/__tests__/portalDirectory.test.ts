import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DIRECT_RFP_PORTALS } from "../directRfpPortals";
import {
  FEATURED_US_PORTAL_IDS,
  INTERNATIONAL_PORTAL_GROUPS,
  buildProcurementPortalDirectory,
} from "../portalDirectory";

describe("procurement portal directory", () => {
  it("resolves all featured United States portals in the requested order", () => {
    const directory = buildProcurementPortalDirectory(DIRECT_RFP_PORTALS);
    assert.deepEqual(
      directory.unitedStates.sources.map((source) => source.id),
      [...FEATURED_US_PORTAL_IDS],
    );
    assert.equal(directory.unitedStates.sources.length, 6);
  });

  it("resolves every configured international portal group", () => {
    const directory = buildProcurementPortalDirectory(DIRECT_RFP_PORTALS);
    assert.deepEqual(
      directory.international.groups.map((group) => group.id),
      INTERNATIONAL_PORTAL_GROUPS.map((group) => group.id),
    );

    for (const configuredGroup of INTERNATIONAL_PORTAL_GROUPS) {
      const resolved = directory.international.groups.find(
        (group) => group.id === configuredGroup.id,
      );
      assert.ok(resolved, `missing directory group ${configuredGroup.id}`);
      assert.deepEqual(
        resolved.sources.map((source) => source.id),
        [...configuredGroup.portalIds],
      );
      assert.ok(resolved.sources.length > 0);
      assert.ok(
        resolved.sources.every((source) => source.level === "international"),
      );
    }
  });

  it("uses unique portal IDs across the complete catalog", () => {
    const ids = DIRECT_RFP_PORTALS.map((portal) => portal.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
