import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedOpportunity } from "../../providers/types";
import {
  isDeterministicallyActionable,
  structuredReviewCandidateLimit,
} from "../structuredOpportunityDecision";

function record(
  overrides: Partial<NormalizedOpportunity> = {},
): NormalizedOpportunity {
  return {
    externalId: "test-1",
    title: "Occupational Health and Employee Medical Examination Services RFP",
    agency: "Example County",
    type: "Solicitation",
    status: "active",
    postedDate: new Date("2026-07-01T00:00:00.000Z"),
    responseDeadline: new Date("2026-09-01T00:00:00.000Z"),
    description:
      "The county requests proposals for pre-employment physical examinations, audiometric testing, spirometry, drug testing, and medical surveillance services for its workforce.",
    sourceUrl: "https://example.gov/procurement/rfp-26-1",
    source: "samGov",
    ...overrides,
  };
}

test("clear active Occu-Med procurements pass without spending AI credits", () => {
  assert.equal(
    isDeterministicallyActionable(
      record(),
      new Date("2026-07-31T00:00:00.000Z").getTime(),
    ),
    true,
  );
});

test("unknown or expired deadlines do not bypass review", () => {
  assert.equal(
    isDeterministicallyActionable(
      record({ responseDeadline: undefined }),
      new Date("2026-07-31T00:00:00.000Z").getTime(),
    ),
    false,
  );
  assert.equal(
    isDeterministicallyActionable(
      record({ responseDeadline: new Date("2026-07-01T00:00:00.000Z") }),
      new Date("2026-07-31T00:00:00.000Z").getTime(),
    ),
    false,
  );
});

test("incidental medical wording in unrelated procurements is not actionable", () => {
  assert.equal(
    isDeterministicallyActionable(
      record({
        title: "Parking Garage Construction Solicitation",
        description:
          "Construct a parking garage. Contractor shall comply with generic employee health and safety requirements.",
      }),
      new Date("2026-07-31T00:00:00.000Z").getTime(),
    ),
    false,
  );
});

test("structured AI review stays within a small trial-key budget", () => {
  const original = process.env.STRUCTURED_RFP_REVIEW_CANDIDATE_LIMIT;
  try {
    delete process.env.STRUCTURED_RFP_REVIEW_CANDIDATE_LIMIT;
    assert.equal(structuredReviewCandidateLimit(), 3);
    process.env.STRUCTURED_RFP_REVIEW_CANDIDATE_LIMIT = "99";
    assert.equal(structuredReviewCandidateLimit(), 5);
    process.env.STRUCTURED_RFP_REVIEW_CANDIDATE_LIMIT = "0";
    assert.equal(structuredReviewCandidateLimit(), 0);
  } finally {
    if (original === undefined) {
      delete process.env.STRUCTURED_RFP_REVIEW_CANDIDATE_LIMIT;
    } else {
      process.env.STRUCTURED_RFP_REVIEW_CANDIDATE_LIMIT = original;
    }
  }
});
