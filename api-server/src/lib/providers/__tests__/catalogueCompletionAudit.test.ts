import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.RFP_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTEL_DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { runCatalogueCompletionAudit } = await import(
  "../catalogueCompletionAudit"
);
const {
  PUBLISHED_DIRECT_RFP_PORTALS,
  REMOVED_UNRUNNABLE_DIRECT_RFP_PORTALS,
  validatePublishedDirectRfpCatalogue,
} = await import("../publishedDirectRfpCatalogue");
const {
  getRegisteredPublicPortalAdapter,
  listRegisteredPublicPortalAdapterIds,
} = await import("../publicPortalAdapterRegistry");
const { PUBLIC_PORTAL_SOURCES, validatePublicPortalCatalog } = await import(
  "../publicPortalProviders/catalog"
);
const { DIRECT_RFP_PORTALS } = await import("../directRfpPortals");

describe("full catalogue completion", () => {
  it("accounts for every raw catalogue row as published runnable or removed", () => {
    const report = runCatalogueCompletionAudit("2026-07-27T00:00:00.000Z");
    assert.equal(report.clean, true, report.errors.join("\n"));
    assert.equal(report.summary.rawRecordsAssessed, DIRECT_RFP_PORTALS.length);
    assert.equal(report.summary.accountedRecords, DIRECT_RFP_PORTALS.length);
    assert.equal(
      report.summary.removedNonRunnableRecords,
      REMOVED_UNRUNNABLE_DIRECT_RFP_PORTALS.length,
    );
  });

  it("publishes no source without runtime collection authority", () => {
    const validation = validatePublishedDirectRfpCatalogue();
    assert.equal(validation.clean, true, JSON.stringify(validation, null, 2));
    assert.ok(PUBLISHED_DIRECT_RFP_PORTALS.length > 1);

    for (const portal of PUBLISHED_DIRECT_RFP_PORTALS) {
      assert.equal(portal.parserStatus, "ready_to_parse", portal.id);
      assert.equal(portal.requiresLogin, false, portal.id);
      if (portal.id === "us-sam-gov") continue;
      assert.ok(getRegisteredPublicPortalAdapter(portal.id), portal.id);
    }
  });

  it("publishes every registered public adapter exactly once", () => {
    const publishedIds = new Set(
      PUBLISHED_DIRECT_RFP_PORTALS.map((portal) => portal.id),
    );
    for (const portalId of listRegisteredPublicPortalAdapterIds()) {
      assert.equal(publishedIds.has(portalId), true, portalId);
    }
    assert.equal(
      new Set(PUBLISHED_DIRECT_RFP_PORTALS.map((portal) => portal.id)).size,
      PUBLISHED_DIRECT_RFP_PORTALS.length,
    );
  });

  it("contains no disabled, unfinished, manual-only, or unadapted public rows", () => {
    const validation = validatePublicPortalCatalog();
    assert.equal(validation.invalidUrls.length, 0, validation.invalidUrls.join(", "));
    assert.equal(validation.duplicateIds.length, 0);
    assert.equal(validation.needsReviewSources, 0);
    assert.equal(validation.disabledLoginOrDynamicSources, 0);

    for (const source of PUBLIC_PORTAL_SOURCES) {
      assert.equal(source.enabled, true, source.id);
      assert.equal(source.verificationStatus, "verified", source.id);
      assert.equal(source.scraperType, "existing_parser", source.id);
      assert.ok(getRegisteredPublicPortalAdapter(source.id), source.id);
    }
  });
});
