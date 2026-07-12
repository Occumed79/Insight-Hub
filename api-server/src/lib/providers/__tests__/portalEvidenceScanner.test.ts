import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOccuMedSearchQueries } from "../../search/occumedProcurementOntology";
import { ENRICHED_DIRECT_RFP_PORTALS } from "../directRfpPortalRelevanceCatalog";
import {
  buildPortalEvidenceScanPlan,
  classifyPortalEvidenceResult,
  isOfficialPortalEvidenceUrl,
} from "../portalEvidenceScanner";

describe("portal evidence scanner", () => {
  it("builds complete portal-by-query coverage without a permanent source cap", () => {
    const portalIds = ENRICHED_DIRECT_RFP_PORTALS.slice(0, 2).map(
      (portal) => portal.id,
    );
    const plan = buildPortalEvidenceScanPlan({
      portalIds,
      includeHistorical: false,
      fullCoverage: true,
      rotationKey: "complete-coverage-test",
    });

    assert.equal(plan.diagnostics.eligiblePortalCount, 2);
    assert.equal(plan.diagnostics.deferredPortalCount, 0);
    assert.equal(
      plan.diagnostics.totalQueryCount,
      portalIds.length * buildOccuMedSearchQueries().length,
    );
    assert.equal(
      plan.diagnostics.selectedQueryCount,
      plan.diagnostics.totalQueryCount,
    );
    assert.deepEqual(
      [...new Set(plan.allQueries.map((query) => query.portalId))].sort(),
      [...portalIds].sort(),
    );
  });

  it("uses a finite rotating execution budget while retaining the full plan", () => {
    const portalIds = ENRICHED_DIRECT_RFP_PORTALS.slice(0, 4).map(
      (portal) => portal.id,
    );
    const first = buildPortalEvidenceScanPlan({
      portalIds,
      executionBudget: 3,
      rotationKey: "2026-07-12T01",
    });
    const second = buildPortalEvidenceScanPlan({
      portalIds,
      executionBudget: 3,
      rotationKey: "2026-07-12T02",
    });

    assert.equal(first.selectedQueries.length, 3);
    assert.equal(second.selectedQueries.length, 3);
    assert.ok(first.allQueries.length > first.selectedQueries.length);
    assert.notEqual(first.diagnostics.rotationOffset, second.diagnostics.rotationOffset);
  });

  it("accepts only URLs hosted by the portal domain", () => {
    assert.equal(
      isOfficialPortalEvidenceUrl(
        { domain: "procurement.example.gov" },
        "https://procurement.example.gov/rfp/123",
      ),
      true,
    );
    assert.equal(
      isOfficialPortalEvidenceUrl(
        { domain: "example.gov" },
        "https://bids.example.gov/rfp/123",
      ),
      true,
    );
    assert.equal(
      isOfficialPortalEvidenceUrl(
        { domain: "example.gov" },
        "https://aggregator.example.com/rfp/123",
      ),
      false,
    );
  });

  it("keeps relevant official solicitation evidence and rejects unrelated bids", () => {
    const portal = ENRICHED_DIRECT_RFP_PORTALS.find(
      (candidate) => candidate.id === "us-sam-gov",
    );
    assert.ok(portal);

    const relevant = classifyPortalEvidenceResult(portal, {
      title: "RFP Occupational Health Services",
      link: "https://sam.gov/opp/example/view",
      snippet:
        "Request for proposals for pre-employment physical examinations, medical surveillance, and drug testing services for employees.",
    });
    assert.ok(relevant);
    assert.ok(relevant.matchedServiceCategories.length > 0);
    assert.ok(relevant.matchedProcurementSignals.length > 0);

    const unrelated = classifyPortalEvidenceResult(portal, {
      title: "Invitation to Bid for Road Resurfacing",
      link: "https://sam.gov/opp/roads/view",
      snippet: "Asphalt paving and lane-striping construction project.",
    });
    assert.equal(unrelated, null);
  });
});
