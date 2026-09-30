import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizedToDbRecord } from "../normalization";

describe("decision reason storage", () => {
  const base = {
    externalId: "t-1",
    title: "Occupational Health Services",
    agency: "DEPT OF VETERANS AFFAIRS",
    type: "Solicitation",
    status: "active" as const,
    postedDate: new Date("2026-09-20"),
    responseDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    description: "Employee medical examinations and drug testing.",
    sourceUrl: "https://sam.gov/opp/t-1/view",
    source: "tango" as const,
  };

  it("keeps the judge's reason in its own segment even when the provider sets its own note", () => {
    const db = normalizedToDbRecord({
      ...base,
      rawData: {
        providerName: "tango",
        notes: "Collected directly from the Tango API.",
        relevanceReason: "Core scope purchases employee medical exams [open].",
        opportunityDecisionMethod: "panel-ai-review",
      },
    }) as any;
    assert.match(db.notes, /\[why: Core scope purchases employee medical exams open\. \| via: panel-ai-review\]/);
    assert.match(db.notes, /Collected directly from the Tango API\./);
  });

  it("omits the segment when there is no reason", () => {
    const db = normalizedToDbRecord({ ...base, rawData: { providerName: "tango" } }) as any;
    assert.doesNotMatch(db.notes ?? "", /\[why:/);
  });
});

describe("unknown posted dates", () => {
  const base = {
    externalId: "d-1", title: "Occupational Health Services", agency: "VA", type: "Solicitation",
    status: "active" as const, description: "x", sourceUrl: "https://sam.gov/opp/d-1/view", source: "tango" as const,
  };
  it("never replaces an invalid or missing posted date with today", () => {
    const db = normalizedToDbRecord({ ...base, postedDate: new Date("not a date") }) as any;
    assert.equal(db.postedDate.getTime(), 0);
    assert.match(db.tags, /date-unknown/);
  });
  it("tags the epoch sentinel as date-unknown", () => {
    const db = normalizedToDbRecord({ ...base, postedDate: new Date(0) }) as any;
    assert.match(db.tags, /date-unknown/);
  });
  it("leaves real dates alone", () => {
    const db = normalizedToDbRecord({ ...base, postedDate: new Date("2026-09-10") }) as any;
    assert.equal(db.postedDate.toISOString().slice(0, 10), "2026-09-10");
    assert.doesNotMatch(db.tags, /date-unknown/);
  });
});
