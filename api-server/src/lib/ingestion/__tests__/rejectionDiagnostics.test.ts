import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedOpportunity } from "../../providers/types";
import {
  decideOpportunityQuality,
  QUALITY_REJECTION_CODES,
} from "../opportunityIdentity";
import {
  buildIngestionRejectionDiagnostics,
  parseStoredQualityReason,
} from "../rejectionDiagnostics";

function record(overrides: Partial<NormalizedOpportunity>): NormalizedOpportunity {
  return {
    externalId: "diagnostic-1",
    title: "RFP Occupational Health Services",
    agency: "State Procurement Office",
    type: "RFP",
    status: "active",
    postedDate: new Date("2026-07-01T00:00:00Z"),
    responseDeadline: new Date("2026-08-01T00:00:00Z"),
    description: "Occupational health examinations and drug testing services.",
    sourceUrl: "https://example.gov/rfp/1",
    source: "publicPortalProviders",
    ...overrides,
  };
}

describe("ingestion rejection diagnostics", () => {
  it("classifies missing procurement versus missing service evidence without changing acceptance", () => {
    const noProcurement = decideOpportunityQuality(
      record({
        title: "Office Furniture Catalog Update",
        agency: "State Facilities Office",
        description: "Chairs and desks for state offices.",
        sourceUrl: "https://example.gov/information/furniture",
      }),
    );
    assert.equal(noProcurement.status, "rejected");
    assert.match(
      noProcurement.reason ?? "",
      new RegExp(`^${QUALITY_REJECTION_CODES.missingProcurementSignal}\\|`),
    );

    const noService = decideOpportunityQuality(
      record({
        title: "RFP Office Furniture Replacement",
        description: "Government solicitation for chairs and desks.",
      }),
    );
    assert.equal(noService.status, "rejected");
    assert.match(
      noService.reason ?? "",
      new RegExp(`^${QUALITY_REJECTION_CODES.missingServiceEvidence}\\|`),
    );

    assert.equal(decideOpportunityQuality(record({})).status, "accepted");
  });

  it("groups reason codes and returns bounded representative samples", () => {
    const diagnostics = buildIngestionRejectionDiagnostics(
      [
        {
          qualityStatus: "rejected",
          qualityReason:
            "missing_occumed_service_evidence|Procurement wording only.",
          count: 80,
        },
        {
          qualityStatus: "rejected",
          qualityReason: "missing_procurement_signal|No procurement wording.",
          count: 14,
        },
      ],
      [
        {
          provider: "publicPortalProviders",
          title: "Office furniture",
          agency: "Agency A",
          qualityStatus: "rejected",
          qualityReason:
            "missing_occumed_service_evidence|Procurement wording only.",
          completenessScore: "75",
          sourceConfidence: "70",
        },
        {
          provider: "sam_gov",
          title: "Informational page",
          agency: "Agency B",
          qualityStatus: "rejected",
          qualityReason: "missing_procurement_signal|No procurement wording.",
          completenessScore: 50,
          sourceConfidence: 65,
        },
      ],
    );

    assert.equal(diagnostics.total, 94);
    assert.deepEqual(
      diagnostics.reasons.map(({ code, count }) => ({ code, count })),
      [
        { code: "missing_occumed_service_evidence", count: 80 },
        { code: "missing_procurement_signal", count: 14 },
      ],
    );
    assert.equal(diagnostics.samples.length, 2);
    assert.equal(diagnostics.samples[0]?.completenessScore, 75);
  });

  it("keeps older generic reasons readable", () => {
    assert.deepEqual(
      parseStoredQualityReason(
        "Record failed the configured Occu-Med opportunity relevance filter.",
      ),
      {
        code: "legacy_relevance_filter",
        label: "Legacy relevance rejection",
        detail:
          "Record failed the configured Occu-Med opportunity relevance filter.",
      },
    );
  });
});
