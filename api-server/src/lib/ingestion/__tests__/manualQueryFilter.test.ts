import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedOpportunity } from "../../providers/types";
import {
  filterRecordsForManualQuery,
  meaningfulManualQueryTerms,
  recordMatchesManualQuery,
} from "../manualQueryFilter";
import {
  calculateCompletenessScore,
  decideOpportunityQuality,
} from "../opportunityIdentity";

function record(
  title: string,
  overrides: Partial<NormalizedOpportunity> = {},
): NormalizedOpportunity {
  return {
    externalId: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    agency: "State Procurement Office",
    type: "RFP",
    status: "active",
    postedDate: new Date("2026-07-24T00:00:00Z"),
    responseDeadline: new Date("2026-08-24T00:00:00Z"),
    description: "",
    solicitationNumber: "RFP-2026-100",
    sourceUrl: "https://example.gov/opportunities/100",
    source: "publicPortalProviders",
    rawData: { sourceConfidence: "high" },
    ...overrides,
  };
}

describe("manual ingestion query boundary", () => {
  it("removes generic services from the exact production query", () => {
    assert.deepEqual(meaningfulManualQueryTerms("occupational health services"), [
      "occupational",
      "health",
    ]);
  });

  it("does not let Utah-style generic services flood the Occu-Med profile run", () => {
    const relevant = record("Occupational Health Services", {
      description:
        "Pre-employment physical examinations, drug testing, audiograms, and respirator fit testing.",
    });
    const engineering = record("2026 Professional Engineering Services");
    const janitorial = record(
      "DFCM Maintenance - Stage II Janitorial Services - Invitation to Bid",
      { type: "Bid" },
    );
    const legal = record("Legal Services for Opioid Litigation");

    const result = filterRecordsForManualQuery(
      [relevant, engineering, janitorial, legal],
      "occupational health services",
    );

    assert.deepEqual(result.records.map((item) => item.title), [
      "Occupational Health Services",
    ]);
    assert.equal(result.skipped, 3);
  });

  it("uses every meaningful term for a custom manual query", () => {
    const mobileMri = record("Mobile MRI and CT Services", {
      description: "Mobile diagnostic imaging services.",
    });
    assert.equal(recordMatchesManualQuery(mobileMri, "mobile MRI services"), true);
    assert.equal(recordMatchesManualQuery(mobileMri, "mobile dental services"), false);
  });

  it("recognizes structured RFP type as procurement evidence", () => {
    const directPortalRecord = record("Occupational Health Program", {
      type: "Request for Proposals (RFP)",
      description:
        "Pre-employment physical examinations and drug testing for employees.",
    });
    assert.equal(decideOpportunityQuality(directPortalRecord).status, "accepted");
  });

  it("does not count the epoch sentinel as a real posted date", () => {
    const unknownDate = record("Occupational Health Services", {
      description: "Occupational health examinations and drug testing.",
      postedDate: new Date(0),
    });
    const knownDate = record("Occupational Health Services", {
      description: "Occupational health examinations and drug testing.",
    });
    assert.equal(
      calculateCompletenessScore(unknownDate),
      calculateCompletenessScore(knownDate) - 13,
    );
  });
});
