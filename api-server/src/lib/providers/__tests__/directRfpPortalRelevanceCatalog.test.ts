import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIRECT_RFP_PORTALS } from "../directRfpPortals";
import {
  DIRECT_RFP_PORTAL_RELEVANCE_RECORDS,
  ENRICHED_DIRECT_RFP_PORTALS,
  enrichedDirectRfpPortalsForOccuMedSearch,
  validateDirectRfpPortalRelevanceCatalog,
} from "../directRfpPortalRelevanceCatalog";

describe("direct RFP portal relevance catalog", () => {
  it("classifies every combined portal exactly once", () => {
    assert.equal(
      DIRECT_RFP_PORTAL_RELEVANCE_RECORDS.length,
      DIRECT_RFP_PORTALS.length,
    );
    assert.equal(ENRICHED_DIRECT_RFP_PORTALS.length, DIRECT_RFP_PORTALS.length);

    const validation = validateDirectRfpPortalRelevanceCatalog();
    assert.deepEqual(validation.missingPortalIds, []);
    assert.deepEqual(validation.unknownPortalIds, []);
    assert.deepEqual(validation.duplicatePortalIds, []);
    assert.deepEqual(validation.invalidRecords, []);
    assert.deepEqual(validation.blockedEvidenceUrls, []);
  });

  it("preserves raw portal fields while applying relevance metadata", () => {
    for (const raw of DIRECT_RFP_PORTALS) {
      const enriched = ENRICHED_DIRECT_RFP_PORTALS.find(
        (portal) => portal.id === raw.id,
      );
      assert.ok(enriched, `missing enriched portal ${raw.id}`);
      assert.equal(enriched.url, raw.url);
      assert.equal(enriched.searchUrl, raw.searchUrl);
      assert.equal(enriched.domain, raw.domain);
      assert.equal(enriched.parserStatus, raw.parserStatus);
      assert.ok(enriched.occumedFit);
      assert.ok(enriched.buyerSector);
      assert.ok(enriched.lastRelevanceVerified);
    }
  });

  it("requires direct official evidence for verified-high portals", () => {
    const verified = ENRICHED_DIRECT_RFP_PORTALS.filter(
      (portal) => portal.occumedFit === "verified_high",
    );
    assert.ok(verified.length > 0);
    for (const portal of verified) {
      assert.ok(portal.relevanceEvidenceUrls.length > 0);
      assert.ok(portal.relevanceEvidence.length > 0);
      assert.ok(portal.occumedServiceCategories.length > 0);
      assert.equal(portal.reviewMethod, "official_relevant_solicitation");
    }
  });

  it("sorts verified and likely sources before broad sources", () => {
    const sorted = enrichedDirectRfpPortalsForOccuMedSearch({
      includeTier3: true,
    });
    const rank = new Map([
      ["verified_high", 0],
      ["likely", 1],
      ["broad", 2],
      ["insufficient_evidence", 3],
      ["irrelevant", 4],
    ]);
    for (let index = 1; index < sorted.length; index += 1) {
      assert.ok(
        (rank.get(sorted[index - 1].occumedFit) ?? 99) <=
          (rank.get(sorted[index].occumedFit) ?? 99),
      );
    }
  });
});
