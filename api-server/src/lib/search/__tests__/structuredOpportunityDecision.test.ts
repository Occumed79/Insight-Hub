import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedOpportunity } from "../../providers/types";
import {
  isDeterministicallyActionable,
  structuredReviewCandidateLimit,
} from "../structuredOpportunityDecision";

const DAY_MS = 24 * 60 * 60 * 1_000;

function record(
  now: number,
  overrides: Partial<NormalizedOpportunity> = {},
): NormalizedOpportunity {
  return {
    externalId: "test-1",
    title: "Occupational Health and Employee Medical Examination Services RFP",
    agency: "Example County",
    type: "Solicitation",
    status: "active",
    postedDate: new Date(now - 30 * DAY_MS),
    responseDeadline: new Date(now + 30 * DAY_MS),
    description:
      "The county requests proposals for pre-employment physical examinations, audiometric testing, spirometry, drug testing, and medical surveillance services for its workforce.",
    sourceUrl: "https://example.gov/procurement/rfp-26-1",
    source: "samGov",
    ...overrides,
  };
}

test("clear active Occu-Med procurements pass without spending AI credits", () => {
  const now = Date.now();
  assert.equal(isDeterministicallyActionable(record(now), now), true);
});

test("unknown or expired deadlines do not bypass review", () => {
  const now = Date.now();
  assert.equal(
    isDeterministicallyActionable(
      record(now, { responseDeadline: undefined }),
      now,
    ),
    false,
  );
  assert.equal(
    isDeterministicallyActionable(
      record(now, { responseDeadline: new Date(now - DAY_MS) }),
      now,
    ),
    false,
  );
});

test("incidental medical wording in unrelated procurements is not actionable", () => {
  const now = Date.now();
  assert.equal(
    isDeterministicallyActionable(
      record(now, {
        title: "Parking Garage Construction Solicitation",
        description:
          "Construct a parking garage. Contractor shall comply with generic employee health and safety requirements.",
      }),
      now,
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
