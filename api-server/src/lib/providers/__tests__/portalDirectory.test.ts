import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DIRECT_RFP_PORTALS } from "../directRfpPortals";
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
import { isManualOnlyPortalSourceId } from "../manualOnlyPortalPolicy";
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
      assert.ok(
        resolved.sources.every((source) => source.level === "international"),
      );
    }
  });

  it("uses unique portal IDs across the complete catalog", () => {
    const ids = DIRECT_RFP_PORTALS.map((portal) => portal.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("builds the inventory from every configured source instead of a featured subset", () => {
    const configuredSources = DIRECT_RFP_PORTALS.map(
      withPortalConnectorCapability,
    );
    const inventory = buildProcurementPortalInventory(configuredSources);
    const inventoriedIds = inventory.groups.flatMap((group) =>
      group.sources.map((source) => source.id),
    );

    assert.equal(inventory.total, configuredSources.length);
    assert.equal(inventoriedIds.length, configuredSources.length);
    assert.deepEqual(
      new Set(inventoriedIds),
      new Set(configuredSources.map((source) => source.id)),
    );
    assert.ok(
      inventory.groups
        .find((group) => group.id === "direct")
        ?.sources.every((source) =>
          ["direct_api", "direct_adapter"].includes(source.connectorStatus),
        ),
    );
  });

  it("does not infer runtime connectivity from a URL, public_html access, or parser status", () => {
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
    assert.equal(catalogOnly.unfinished, false);

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

  it("uses the adapter registry as the sole source-specific runtime authority", () => {
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
    assert.equal(texas.registeredAdapter, true);
    assert.equal(texas.runtimeRunnable, true);
  });

  it("reports catalogued, registered, runnable, unfinished, disabled, and quarantined separately", () => {
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
        id: "disabled",
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
      {
        id: "catalogued",
        registeredAdapter: false,
        runtimeRunnable: false,
        unfinished: false,
        disabled: false,
      },
    ]);

    assert.deepEqual(inventory.summary, {
      catalogued: 5,
      registeredAdapters: 2,
      runnable: 1,
      unfinished: 1,
      disabled: 1,
      quarantined: 1,
    });
    assert.deepEqual(
      inventory.groups.map((group) => [group.id, group.sources.length]),
      [
        ["runnable", 1],
        ["unfinished", 1],
        ["disabled", 1],
        ["quarantined", 1],
        ["catalogued", 1],
      ],
    );
  });

  it("hardens public portal source URLs and imported directory rows", () => {
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

  it("uses current Florida procurement pages and excludes the robots-blocked OCPS directory from automation", () => {
    const miami = DIRECT_RFP_PORTALS.find(
      (portal) => portal.id === "fl-miami-procurement",
    );
    const nova = DIRECT_RFP_PORTALS.find(
      (portal) => portal.id === "fl-nova-procurement",
    );
    const ocpsDirectory = DIRECT_RFP_PORTALS.find(
      (portal) => portal.id === "fl-orange-county-public-schools",
    );
    const ocpsAutomated = PUBLIC_PORTAL_SOURCES.find(
      (source) => source.id === "fl-orange-county-public-schools",
    );

    assert.equal(
      miami?.searchUrl,
      "https://www.miami.gov/My-Government/Departments/Procurement",
    );
    assert.equal(
      nova?.searchUrl,
      "https://www.nova.edu/procurement/index.html",
    );
    assert.ok(ocpsDirectory, "OCPS should remain available in the directory");
    assert.equal(isManualOnlyPortalSourceId("fl-orange-county-public-schools"), true);
    assert.equal(ocpsAutomated, undefined);
  });
});
