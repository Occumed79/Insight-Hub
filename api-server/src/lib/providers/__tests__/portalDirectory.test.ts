import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DELETED_PORTAL_IDS } from "../deletedPortalPolicy";
import { DIRECT_RFP_PORTALS } from "../directRfpPortals";
import { ENRICHED_DIRECT_RFP_PORTALS } from "../directRfpPortalRelevanceCatalog";
import {
  FEATURED_US_PORTAL_IDS,
  INTERNATIONAL_PORTAL_GROUPS,
  buildProcurementPortalDirectory,
  buildProcurementPortalInventory,
} from "../portalDirectory";
import {
  portalConnectorCapability,
  withPortalConnectorCapability,
} from "../portalCapabilities";
import {
  isRegisteredPublicPortalAdapter,
  listRegisteredPublicPortalAdapterIds,
} from "../publicPortalAdapterRegistry";
import { buildPublicPortalRuntimeInventory } from "../publicPortalRuntimeInventory";
import {
  PUBLIC_PORTAL_SOURCES,
  publicPortalSourceFromImport,
  validatePublicPortalCatalog,
  validatePublicPortalSource,
} from "../publicPortalProviders/catalog";

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
    }
  });

  it("uses unique portal IDs across the complete source definitions", () => {
    const ids = DIRECT_RFP_PORTALS.map((portal) => portal.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("builds inventory only from the published source catalogue", () => {
    const publishedSources = ENRICHED_DIRECT_RFP_PORTALS.map(
      withPortalConnectorCapability,
    );
    const inventory = buildProcurementPortalInventory(publishedSources);
    const inventoriedIds = inventory.groups.flatMap((group) =>
      group.sources.map((source) => source.id),
    );

    assert.equal(inventory.total, publishedSources.length);
    assert.equal(inventoriedIds.length, publishedSources.length);
    assert.deepEqual(
      new Set(inventoriedIds),
      new Set(publishedSources.map((source) => source.id)),
    );
    assert.ok(
      publishedSources.every(
        (source) => !source.disabled && !DELETED_PORTAL_IDS.has(source.id),
      ),
    );
  });

  it("does not infer runtime connectivity from a URL or parser label", () => {
    const catalogOnly = portalConnectorCapability({
      id: "catalog-only-example",
      country: "US",
      level: "state",
      accessMode: "public_html",
      parserStatus: "catalog_only",
      requiresKey: false,
      requiresLogin: false,
    });
    assert.equal(catalogOnly.connectorStatus, "directory_only");
    assert.equal(catalogOnly.runtimeRunnable, false);
    assert.equal(catalogOnly.registeredAdapter, false);

    const needsParser = portalConnectorCapability({
      id: "needs-parser-example",
      country: "US",
      level: "state",
      accessMode: "public_html",
      parserStatus: "needs_parser",
      requiresKey: false,
      requiresLogin: false,
    });
    assert.equal(needsParser.connectorStatus, "stub");
    assert.equal(needsParser.runtimeRunnable, false);
    assert.equal(needsParser.unfinished, true);
  });

  it("uses the adapter registry as the sole runtime authority", () => {
    assert.equal(isRegisteredPublicPortalAdapter("tx-esbd"), true);
    assert.equal(isRegisteredPublicPortalAdapter("es-placsp"), false);
    assert.ok(listRegisteredPublicPortalAdapterIds().includes("tx-esbd"));

    const texas = portalConnectorCapability({
      id: "tx-esbd",
      country: "US",
      level: "state",
      accessMode: "csv",
      parserStatus: "ready_to_parse",
      requiresKey: false,
      requiresLogin: false,
    });
    assert.equal(texas.connectorStatus, "direct_adapter");
    assert.equal(texas.runtimeRunnable, true);
  });

  it("drops disabled records instead of creating a disabled inventory group", () => {
    const inventory = buildPublicPortalRuntimeInventory([
      {
        id: "adapter",
        registeredAdapter: true,
        runtimeRunnable: true,
        unfinished: false,
        disabled: false,
      },
      {
        id: "unfinished",
        registeredAdapter: false,
        runtimeRunnable: false,
        unfinished: true,
        disabled: false,
      },
      {
        id: "deleted-disabled",
        registeredAdapter: false,
        runtimeRunnable: false,
        unfinished: false,
        disabled: true,
      },
      {
        id: "quarantined",
        registeredAdapter: true,
        runtimeRunnable: true,
        unfinished: false,
        disabled: false,
        quarantined: true,
      },
    ]);

    assert.equal(inventory.total, 3);
    assert.equal(inventory.summary.disabled, 0);
    assert.equal(
      inventory.groups.some((group) => String(group.id) === "disabled"),
      false,
    );
    assert.equal(
      inventory.groups.flatMap((group) => group.sources)
        .some((source) => source.id === "deleted-disabled"),
      false,
    );
  });

  it("hardens public portal source URLs and imported rows", () => {
    const imported = publicPortalSourceFromImport({
      agencyName: "Example City",
      state: "ca",
      sourceUrl: "https://procurement.example.gov/bids",
      searchUrl: "https://procurement.example.gov/bids?status=open",
      enabled: "true",
      verificationStatus: "verified",
    });
    assert.equal(imported.domain, "procurement.example.gov");
    assert.deepEqual(validatePublicPortalSource(imported), []);

    const invalid = {
      ...imported,
      id: "bad id",
      searchUrl: "https://evil.example.com/bids",
    };
    assert.deepEqual(validatePublicPortalSource(invalid), [
      "id must not contain whitespace",
      "searchUrl hostname must match domain",
    ]);
    assert.deepEqual(validatePublicPortalCatalog([invalid]).invalidUrls, [
      "bad id",
    ]);
  });

  it("deletes every manual-only, blocked, or inaccessible source from published catalogues", () => {
    const publishedDirectIds = new Set(
      ENRICHED_DIRECT_RFP_PORTALS.map((portal) => portal.id),
    );
    const publicSourceIds = new Set(
      PUBLIC_PORTAL_SOURCES.map((source) => source.id),
    );

    for (const sourceId of DELETED_PORTAL_IDS) {
      assert.equal(
        publishedDirectIds.has(sourceId),
        false,
        `${sourceId} must not remain in the published direct catalogue`,
      );
      assert.equal(
        publicSourceIds.has(sourceId),
        false,
        `${sourceId} must not remain in the public source catalogue`,
      );
      assert.equal(
        isRegisteredPublicPortalAdapter(sourceId),
        false,
        `${sourceId} must not remain in the adapter registry`,
      );
    }
  });

  it("keeps corrected official Florida pages while deleting OCPS", () => {
    const miami = DIRECT_RFP_PORTALS.find(
      (portal) => portal.id === "fl-miami-procurement",
    );
    const nova = DIRECT_RFP_PORTALS.find(
      (portal) => portal.id === "fl-nova-procurement",
    );

    assert.equal(
      miami?.searchUrl,
      "https://www.miami.gov/My-Government/Departments/Procurement",
    );
    assert.equal(
      nova?.searchUrl,
      "https://www.nova.edu/procurement/index.html",
    );
    assert.equal(
      ENRICHED_DIRECT_RFP_PORTALS.some(
        (portal) => portal.id === "fl-orange-county-public-schools",
      ),
      false,
    );
  });
});
