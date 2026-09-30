import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NormalizedOpportunity } from "../types";
import { parseCanadaBuysPageFacts, verifyCanadaBuysRecords } from "../canadaBuysPageVerification";

const NOW = new Date("2026-09-30T15:00:00Z");
const pad = "Tender notice details and description for this procurement opportunity. ".repeat(5);

function record(url: string): NormalizedOpportunity {
  return {
    externalId: `web-${url}`,
    title: "Occupational Health Services - Tender Notice | CanadaBuys",
    agency: "Occupational / employee medical services",
    type: "Solicitation",
    status: "active",
    postedDate: NOW, // the invented "now" stamp
    sourceUrl: url,
    source: "internationalPublicPortals",
    rawData: { dateUnknown: true, tags: ["date-unknown"] },
  };
}
const page = (extra: string) => `${pad}\nContracting entity: Public Services and Procurement Canada\n${extra}`;
const run = (text: string | null) =>
  verifyCanadaBuysRecords([record("https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/x")], {
    dateRangeDays: 90, now: NOW, fetchText: async () => text,
  });

describe("CanadaBuys page verification", () => {
  it("parses slash dates, closing date and buyer", () => {
    const facts = parseCanadaBuysPageFacts(page("Publication date: 2026/09/13\nClosing date and time: 2026/10/20 14:00 EDT"));
    assert.equal(facts.publicationDate?.getUTCMonth(), 8);
    assert.equal(facts.closingDate?.getUTCMonth(), 9);
    assert.equal(facts.agency, "Public Services and Procurement Canada");
  });

  it("drops a tender whose closing date has passed", async () => {
    const result = await run(page("Publication date: 2022/12/01\nClosing date and time: 2023/01/13 13:00 EST"));
    assert.equal(result.verified.length, 0);
    assert.match(result.dropped[0]!.reason, /closing date has passed/);
  });

  it("drops cancelled tenders, unreadable pages and pages with no closing date", async () => {
    assert.match((await run(page("Closing date: 2026/11/01\nStatus: Cancelled"))).dropped[0]!.reason, /cancelled/);
    assert.match((await run(null)).dropped[0]!.reason, /could not be read/);
    assert.match((await run(page("Publication date: 2026/09/13"))).dropped[0]!.reason, /closing date not found/);
  });

  it("keeps an open tender with the real dates and buyer", async () => {
    const result = await run(page("Publication date: 2026/09/13\nClosing date and time: 2026/10/20 14:00 EDT"));
    assert.equal(result.verified.length, 1);
    const kept = result.verified[0]!;
    assert.equal(kept.postedDate.toISOString().slice(0, 10), "2026-09-13");
    assert.equal(kept.responseDeadline?.toISOString().slice(0, 10), "2026-10-20");
    assert.equal(kept.agency, "Public Services and Procurement Canada");
    assert.equal(kept.rawData?.dateUnknown, false);
    assert.deepEqual(kept.rawData?.tags, []);
  });

  it("keeps an open tender with no stated publication date as honestly unknown, not today", async () => {
    const result = await run(page("Closing date and time: 2026/10/20 14:00 EDT"));
    const kept = result.verified[0]!;
    assert.equal(kept.postedDate.getTime(), 0);
    assert.equal(kept.rawData?.dateUnknown, true);
    assert.ok((kept.rawData?.tags as string[]).includes("date-unknown"));
  });
});
