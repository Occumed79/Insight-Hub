import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSamGovAutonomousTitleQueries,
  buildSamGovTitleQueries,
  isBidReadySamOpportunity,
} from "../samGovQuality";

const now = new Date("2026-07-29T19:00:00.000Z");
const openSolicitation = {
  noticeId: "notice-1",
  title: "Occupational Health Services",
  type: "Solicitation",
  active: "Yes",
  postedDate: "2026-07-20",
  responseDeadLine: "2026-08-30T23:59:00.000Z",
};

describe("SAM.gov bid-ready query policy", () => {
  it("maps natural procurement wording to supported high-intent title queries", () => {
    assert.deepEqual(
      buildSamGovTitleQueries(
        "occupational health services city county RFP due soon",
      ),
      ["occupational health"],
    );
    assert.deepEqual(
      buildSamGovTitleQueries("drug testing and DOT physical solicitation"),
      ["drug testing", "medical examination"],
    );
  });

  it("reserves blank input for the rotating autonomous service portfolio", () => {
    assert.deepEqual(buildSamGovTitleQueries(), []);
    assert.deepEqual(buildSamGovAutonomousTitleQueries(0, 2), [
      "occupational health",
      "occupational medicine",
    ]);
    assert.deepEqual(buildSamGovAutonomousTitleQueries(6, 3), [
      "respiratory protection",
      "hearing conservation",
      "occupational health",
    ]);
  });

  it("accepts only active bid notices with a future response deadline", () => {
    assert.equal(isBidReadySamOpportunity(openSolicitation, now), true);
    assert.equal(
      isBidReadySamOpportunity(
        { ...openSolicitation, responseDeadLine: "2026-07-01" },
        now,
      ),
      false,
    );
    assert.equal(
      isBidReadySamOpportunity(
        { ...openSolicitation, type: "Sources Sought" },
        now,
      ),
      false,
    );
    assert.equal(
      isBidReadySamOpportunity(
        {
          ...openSolicitation,
          type: "Award Notice",
          award: { amount: 125000 },
        },
        now,
      ),
      false,
    );
  });
});
