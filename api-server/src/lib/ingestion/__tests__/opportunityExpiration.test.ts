import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedOpportunity } from "../../providers/types";
import {
  evaluateOpportunityExpiration,
  filterExpiredOpportunities,
  shouldFetchOpportunityDetail,
} from "../opportunityExpiration";

function opportunity(
  overrides: Partial<NormalizedOpportunity> = {},
): NormalizedOpportunity {
  return {
    externalId: "test-opportunity",
    title: "Current public solicitation",
    agency: "Test Agency",
    type: "RFP",
    status: "active",
    postedDate: new Date("2026-07-01T12:00:00Z"),
    source: "publicPortalProviders",
    ...overrides,
  };
}

const now = new Date("2026-07-23T18:00:00Z");

test("rejects archived and source-closed opportunities without requiring a deadline", () => {
  assert.deepEqual(
    evaluateOpportunityExpiration(opportunity({ status: "archived" }), now),
    { expired: true, reason: "archived_status" },
  );
  assert.deepEqual(
    evaluateOpportunityExpiration(
      opportunity({ rawData: { listingStatus: "Awarded" } }),
      now,
    ),
    { expired: true, reason: "closed_source_status" },
  );
});

test("rejects exact past deadlines after the grace window", () => {
  const decision = evaluateOpportunityExpiration(
    opportunity({ responseDeadline: new Date("2026-07-23T12:00:00Z") }),
    now,
  );
  assert.equal(decision.expired, true);
  assert.equal(decision.reason, "past_deadline");
});

test("keeps recent exact deadlines inside the two-hour grace window", () => {
  const decision = evaluateOpportunityExpiration(
    opportunity({ responseDeadline: new Date("2026-07-23T17:00:00Z") }),
    now,
  );
  assert.equal(decision.expired, false);
});

test("treats date-only deadlines as end-of-day rather than midnight", () => {
  const record = opportunity({
    responseDeadline: new Date("2026-07-23T00:00:00Z"),
    rawData: { deadlinePrecision: "date" },
  });
  assert.equal(evaluateOpportunityExpiration(record, now).expired, false);
  assert.equal(shouldFetchOpportunityDetail(record, now), true);
});

test("keeps explicitly open opportunities when the deadline is unknown", () => {
  const record = opportunity({
    responseDeadline: undefined,
    rawData: { listingStatus: "Open", deadlineUnknown: true },
  });
  assert.equal(evaluateOpportunityExpiration(record, now).expired, false);
  assert.equal(shouldFetchOpportunityDetail(record, now), true);
});

test("filters expired records and reports reason counts", () => {
  const result = filterExpiredOpportunities(
    [
      opportunity({ externalId: "active" }),
      opportunity({ externalId: "archived", status: "archived" }),
      opportunity({
        externalId: "past",
        responseDeadline: new Date("2026-07-20T12:00:00Z"),
      }),
      opportunity({
        externalId: "cancelled",
        rawData: { portalStatus: "Cancelled" },
      }),
    ],
    now,
  );

  assert.deepEqual(result.records.map((record) => record.externalId), ["active"]);
  assert.equal(result.expiredSkipped, 3);
  assert.deepEqual(result.reasons, {
    archived_status: 1,
    past_deadline: 1,
    closed_source_status: 1,
  });
});
