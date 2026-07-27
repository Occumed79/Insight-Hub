import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { DELETED_PORTAL_IDS } = await import("../deletedPortalPolicy");
const { DIRECT_RFP_PORTALS } = await import("../directRfpPortals");
const { ENRICHED_DIRECT_RFP_PORTALS } = await import(
  "../directRfpPortalRelevanceCatalog"
);
const { buildProcurementPortalDirectory, buildProcurementPortalInventory } =
  await import("../portalDirectory");
const { portalConnectorCapability, withPortalConnectorCapability } =
  await import("../portalCapabilities");
const {
  PUBLISHED_DIRECT_RFP_PORTALS,
  PUBLISHED_DIRECT_RFP_PORTAL_IDS,
} = await import("../publishedDirectRfpCatalogue");
const {
  isRegisteredPublicPortalAdapter,
  listRegisteredPublicPortalAdapterIds,
} = await import("../publicPortalAdapterRegistry");
const { buildPublicPortalRuntimeInventory } = await import(
  "../publicPortalRuntimeInventory"
);
const {
  PUBLIC_PORTAL_SOURCES,
  publicPortalSourceFromImport,
  validatePublicPortalCatalog,
  validatePublicPortalSource,
} = await import("../publicPortalProviders/catalog");

describe("procurement portal directory", () => {
  it("uses unique portal IDs across the complete source definitions", () => {
    const ids = DIRECT_RFP_PORTALS.map((portal) => portal.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("builds directory and inventory only from published runtime sources", () => {
    const enrichedById = new Map(
      ENRICHED_DIRECT_RFP_PORTALS.map((portal) => [portal.id, portal]),
    );
    const publishedSources = PUBLISHED_DIRECT_RFP_PORTALS.flatMap((portal) => {
      const enriched = enrichedById.get(portal.id);
      return enriched ? [withPortalConnectorCapability(enriched)] : [];
    });
    const directory = buildProcurementPortalDirectory(publishedSources);
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
      [...directory.unitedStates.sources, ...directory.international.groups.flatMap((group) => group.sources)].every(
        (source) => PUBLISHED_DIRECT_RFP_PORTAL_IDS.has(source.id),
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

  it("rejects non-runnable records from the runtime inventory", () => {
    assert.throws(
      () =>
        buildPublicPortalRuntimeInventory([
          {
            id: "unfinished",
            registeredAdapter: false,
            runtimeRunnable: false,
            unfinished: true,
            disabled: false,
          },
        ]),
      /Non-runnable source cannot enter/,
    );

    const inventory = buildPublicPortalRuntimeInventory([
      {
        id: "adapter",
        registeredAdapter: true,
        runtimeRunnable: true,
        unfinished: false,
        disabled: false,
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
    assert.deepEqual(inventory.summary, {
      catalogued: 2,
      registeredAdapters: 2,
      runnable: 1,
      quarantined: 1,
    });
    assert.deepEqual(
      inventory.groups.map((group) => [group.id, group.sources.length]),
      [
        ["runnable", 1],
        ["quarantined", 1],
      ],
    );
  });

  it("hardens public portal source URLs and rejects unregistered imports", () => {
    const imported = publicPortalSourceFromImport({
      id: "tx-esbd",
      agencyName: "Texas ESBD",
      state: "tx",
      sourceUrl: "https://www.txsmartbuy.gov/esbd",
      searchUrl: "https://www.txsmartbuy.gov/esbd",
      enabled: "true",
      verificationStatus: "verified",
    });
    assert.equal(imported.domain, "txsmartbuy.gov");
    assert.deepEqual(validatePublicPortalSource(imported), []);

    assert.throws(
      () =>
        publicPortalSourceFromImport({
          id: "unregistered-example",
          agencyName: "Example City",
          state: "ca",
          sourceUrl: "https://procurement.example.gov/bids",
        }),
      /no registered runtime adapter/i,
    );

    const invalid = {
      ...imported,
      id: "bad id",
      searchUrl: "https://evil.example.com/bids",
    };
    const errors = validatePublicPortalSource(invalid);
    assert.ok(errors.includes("id must not contain whitespace"));
    assert.ok(
      errors.includes("public catalogue sources require a registered runtime adapter"),
    );
    assert.ok(errors.includes("searchUrl hostname must match domain"));
    assert.deepEqual(validatePublicPortalCatalog([invalid]).invalidUrls, [
      "bad id",
    ]);
  });

  it("deletes every manual-only, blocked, or inaccessible source from published catalogues", () => {
    const publicSourceIds = new Set(
      PUBLIC_PORTAL_SOURCES.map((source) => source.id),
    );

    for (const sourceId of DELETED_PORTAL_IDS) {
      assert.equal(PUBLISHED_DIRECT_RFP_PORTAL_IDS.has(sourceId), false, sourceId);
      assert.equal(publicSourceIds.has(sourceId), false, sourceId);
      assert.equal(isRegisteredPublicPortalAdapter(sourceId), false, sourceId);
    }
  });
});
