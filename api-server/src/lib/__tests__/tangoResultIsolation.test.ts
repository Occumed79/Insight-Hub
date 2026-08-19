import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyOpportunityQuality } from "../opportunityQuality";

const now = new Date("2026-08-18T12:00:00.000Z");
const directLookingRecord = {
  title: "RFP Occupational Health Services",
  agency: "U.S. Department of Example",
  type: "Solicitation",
  status: "active",
  postedDate: new Date("2026-08-10T00:00:00.000Z"),
  responseDeadline: new Date("2026-09-15T17:00:00.000Z"),
  description:
    "Request for proposal for employee occupational health examinations, medical surveillance, audiometry, spirometry, and drug testing.",
  samUrl: "https://sam.gov/opp/example/view",
  sourceConfidence: "high",
  tags: JSON.stringify([
    "evidence:direct-structured",
    "complete-direct-evidence",
  ]),
};

describe("Tango result isolation", () => {
  it("keeps Tango out of Bid-ready & Verified even when its metadata looks complete", () => {
    const quality = classifyOpportunityQuality(
      { ...directLookingRecord, providerName: "tango" },
      now,
    );

    assert.equal(quality.classification, "discovery-only");
    assert.equal(quality.actionable, false);
    assert.equal(quality.summaryEligible, false);
    assert.equal(quality.sourceVerified, false);
    assert.equal(quality.sourceType, "search-discovery");
  });

  it("leaves SAM.gov direct records eligible for verified-open", () => {
    const quality = classifyOpportunityQuality(
      { ...directLookingRecord, providerName: "samGov" },
      now,
    );

    assert.equal(quality.classification, "verified-open");
    assert.equal(quality.actionable, true);
    assert.equal(quality.sourceVerified, true);
  });
});
