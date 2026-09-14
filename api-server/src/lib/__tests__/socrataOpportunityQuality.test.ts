import assert from "node:assert/strict";
import test from "node:test";
import { classifyOpportunityQuality } from "../opportunityQuality";

const now = new Date("2026-09-14T12:00:00.000Z");

test("qualified live Socrata rows are official direct evidence rather than search discovery", () => {
  const quality = classifyOpportunityQuality(
    {
      title: "RFP Occupational Health Services",
      agency: "City of Example",
      type: "Solicitation",
      status: "active",
      postedDate: new Date("2026-09-01T00:00:00.000Z"),
      responseDeadline: new Date("2026-10-15T17:00:00.000Z"),
      description:
        "Request for proposal for occupational health examinations, medical surveillance, and drug testing.",
      sourceUrl: "https://data.example.gov/resource/abcd-1234",
      providerName: "socrata",
      sourceConfidence: "high",
      relevanceScore: "90",
      tags: ["evidence:direct-structured", "complete-direct-evidence"],
    },
    now,
  );

  assert.equal(quality.sourceType, "official-direct");
  assert.equal(quality.sourceVerified, true);
  assert.equal(quality.classification, "verified-open");
});
