import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NormalizedOpportunity } from "../types";
import {
  parseSamPageFacts,
  verifySamPublicRecords,
} from "../samGovPageVerification";

const NOW = new Date("2026-09-30T15:00:00Z");

function record(url: string, extra: Partial<NormalizedOpportunity> = {}): NormalizedOpportunity {
  return {
    externalId: `web-${url}`,
    title: "Occupational Health Services",
    agency: "Occupational / employee medical services",
    type: "Solicitation",
    status: "active",
    postedDate: NOW, // the fake "now" stamp the discovery pipeline used to add
    sourceUrl: url,
    source: "samGov",
    rawData: { dateUnknown: true, tags: ["date-unknown", "ai-pending"] },
    ...extra,
  };
}

const pad = "Contract Opportunity details and description for this notice. ".repeat(6);
const page = (posted: string, extra = "") =>
  `${pad}\nDepartment/Ind. Agency: DEPT OF ENERGY\nOriginal Published Date: ${posted}\nCurrent Archive Date: 2027-01-01\n${extra}`;

describe("SAM.gov public page verification", () => {
  it("parses posted date, deadline and agency from the page", () => {
    const facts = parseSamPageFacts(
      page("Sep 10, 2026", "Current Date Offers Due: Oct 14, 2026"),
      NOW,
    );
    assert.equal(facts.postedDate?.getUTCFullYear(), 2026);
    assert.equal(facts.responseDeadline?.getUTCMonth(), 9);
    assert.equal(facts.agency, "DEPT OF ENERGY");
    assert.equal(facts.inactive, false);
  });

  it("drops a 2023 notice that discovery had stamped with today's date", async () => {
    const result = await verifySamPublicRecords([record("https://sam.gov/opp/a/view")], {
      dateRangeDays: 90,
      now: NOW,
      fetchText: async () => page("2023-05-04"),
    });
    assert.equal(result.verified.length, 0);
    assert.match(result.dropped[0]!.reason, /before the date window/);
  });

  it("drops records whose page has no readable posted date instead of guessing", async () => {
    const result = await verifySamPublicRecords([record("https://sam.gov/opp/b/view")], {
      dateRangeDays: 90,
      now: NOW,
      fetchText: async () => `${pad}\nNo dates here at all.`,
    });
    assert.equal(result.verified.length, 0);
    assert.match(result.dropped[0]!.reason, /posted date not found/);
  });

  it("drops unreadable pages", async () => {
    const result = await verifySamPublicRecords([record("https://sam.gov/opp/c/view")], {
      dateRangeDays: 90,
      now: NOW,
      fetchText: async () => null,
    });
    assert.equal(result.verified.length, 0);
  });

  it("drops archived and expired notices", async () => {
    const archived = await verifySamPublicRecords([record("https://sam.gov/opp/d/view")], {
      dateRangeDays: 90,
      now: NOW,
      fetchText: async () => page("2026-09-01", "Status: Inactive"),
    });
    assert.match(archived.dropped[0]!.reason, /archived or inactive/);

    const expired = await verifySamPublicRecords([record("https://sam.gov/opp/e/view")], {
      dateRangeDays: 90,
      now: NOW,
      fetchText: async () => page("2026-08-20", "Current Date Offers Due: Sep 01, 2026"),
    });
    assert.match(expired.dropped[0]!.reason, /deadline has passed/);
  });

  it("keeps a confirmed notice with the real date and agency, and clears fake tags", async () => {
    const result = await verifySamPublicRecords([record("https://sam.gov/opp/f/view")], {
      dateRangeDays: 90,
      now: NOW,
      fetchText: async () => page("2026-09-10", "Current Date Offers Due: Oct 14, 2026"),
    });
    assert.equal(result.verified.length, 1);
    const kept = result.verified[0]!;
    assert.equal(kept.postedDate.toISOString().slice(0, 10), "2026-09-10");
    assert.equal(kept.agency, "DEPT OF ENERGY");
    assert.equal(kept.rawData?.samPageVerified, true);
    assert.equal(kept.rawData?.dateUnknown, false);
    assert.deepEqual(kept.rawData?.tags, ["ai-pending"]);
  });
});
